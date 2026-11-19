import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { query, run } from "./db";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function authenticated() {
  const token = (await cookies()).get("oryx_session")?.value;
  if (!token) return false;
  return (
    (
      await query("SELECT id FROM sessions WHERE id=? AND expires_at>?", [
        hash(token),
        Date.now(),
      ])
    ).length === 1
  );
}
export async function createSession() {
  const token = randomBytes(32).toString("hex");
  await run("INSERT INTO sessions(id,expires_at) VALUES(?,?)", [
    hash(token),
    Date.now() + 30 * 86400000,
  ]);
  (await cookies()).set("oryx_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 86400,
  });
}
export function origin() {
  return process.env.APP_URL || "http://localhost:3100";
}
export function sameOrigin(r: Request) {
  return r.headers.get("origin") === origin();
}
