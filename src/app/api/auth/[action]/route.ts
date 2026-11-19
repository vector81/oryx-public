import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { query, run } from "@/lib/db";
import { createSession, hash, origin, sameOrigin, equal } from "@/lib/auth";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    if (!sameOrigin(request))
      return NextResponse.json(
        { error: "This request must come from ORYX." },
        { status: 403 },
      );
    const { action } = await params;
    const body = await request.json();
    const rpID = new URL(origin()).hostname;
    const jar = await cookies();
    if (action === "dev-login") {
      const local = ["localhost", "127.0.0.1"].includes(
        new URL(request.url).hostname,
      );
      if (
        process.env.NODE_ENV !== "development" ||
        !local ||
        !process.env.LOCAL_DEV_TOKEN ||
        Date.now() > Number(process.env.LOCAL_DEV_EXPIRES || 0) ||
        !equal(String(body.token || ""), process.env.LOCAL_DEV_TOKEN)
      ) {
        return NextResponse.json(
          { error: "Local preview link is invalid or expired." },
          { status: 403 },
        );
      }
      await createSession();
      return NextResponse.json({ ok: true });
    }
    if (action === "logout") {
      const s = jar.get("oryx_session")?.value;
      if (s) await run("DELETE FROM sessions WHERE id=?", [hash(s)]);
      jar.delete("oryx_session");
      return NextResponse.json({ ok: true });
    }
    const creds = await query<{
      id: string;
      public_key: string;
      counter: number;
      transports: string;
    }>("SELECT * FROM credentials");
    if (action === "register-options") {
      if (
        creds.length ||
        !process.env.SETUP_TOKEN ||
        !equal(String(body.token || ""), process.env.SETUP_TOKEN)
      )
        return NextResponse.json(
          { error: "Setup link is invalid or this account is already set up." },
          { status: 403 },
        );
      const options = await generateRegistrationOptions({
        rpName: "ORYX",
        rpID,
        userName: "Demo User",
        userDisplayName: "Demo User",
        userID: new TextEncoder().encode("demo-user"),
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      });
      const id = randomBytes(24).toString("hex");
      await run("INSERT INTO challenges VALUES(?,?,?,?)", [
        id,
        options.challenge,
        "register",
        Date.now() + 300000,
      ]);
      jar.set("oryx_challenge", id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 300,
      });
      return NextResponse.json(options);
    }
    if (action === "login-options") {
      if (!creds.length)
        return NextResponse.json(
          { error: "Use your private setup link to add your passkey first." },
          { status: 400 },
        );
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "required",
        allowCredentials: creds.map((c) => ({
          id: c.id,
          transports: JSON.parse(c.transports),
        })),
      });
      const id = randomBytes(24).toString("hex");
      await run("INSERT INTO challenges VALUES(?,?,?,?)", [
        id,
        options.challenge,
        "login",
        Date.now() + 300000,
      ]);
      jar.set("oryx_challenge", id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 300,
      });
      return NextResponse.json(options);
    }
    const challengeID = jar.get("oryx_challenge")?.value;
    jar.delete("oryx_challenge");
    const [ch] = await query<{ challenge: string; kind: string }>(
      "DELETE FROM challenges WHERE id=? AND expires_at>? RETURNING challenge,kind",
      [challengeID || "", Date.now()],
    );
    if (!ch) throw new Error("This sign-in expired. Please try again.");
    if (action === "register-verify" && ch.kind === "register") {
      if (creds.length) throw new Error("This account already has a passkey.");
      const result = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin(),
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!result.verified || !result.registrationInfo)
        throw new Error("Passkey could not be verified.");
      const c = result.registrationInfo.credential;
      await run(
        "INSERT INTO credentials(id,public_key,counter,transports) VALUES(?,?,?,?)",
        [
          c.id,
          Buffer.from(c.publicKey).toString("base64url"),
          c.counter,
          JSON.stringify(c.transports || []),
        ],
      );
    } else if (action === "login-verify" && ch.kind === "login") {
      const c = creds.find((c) => c.id === body.id);
      if (!c) throw new Error("Passkey not recognised.");
      const result = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin(),
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: c.id,
          publicKey: new Uint8Array(Buffer.from(c.public_key, "base64url")),
          counter: c.counter,
          transports: JSON.parse(c.transports) as AuthenticatorTransport[],
        },
      });
      if (!result.verified) throw new Error("Passkey could not be verified.");
      await run("UPDATE credentials SET counter=? WHERE id=?", [
        result.authenticationInfo.newCounter,
        c.id,
      ]);
    } else throw new Error("Invalid sign-in request.");
    await createSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      {
        error:
          "Sign-in could not finish. Try again with your passkey or reopen the setup link.",
      },
      { status: 400 },
    );
  }
}
