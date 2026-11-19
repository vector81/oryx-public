"use client";
import Image from "next/image";
import { useState, useEffect } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { Fingerprint, ArrowUpRight } from "lucide-react";
export default function Login({
  localPreview = false,
}: {
  localPreview?: boolean;
}) {
  const [devToken, setDevToken] = useState("");
  const [setup, setSetup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const values = new URLSearchParams(location.hash.slice(1));
    const token = values.get("setup");
    if (localPreview && values.get("preview")) {
      setDevToken(values.get("preview") || "");
      history.replaceState(null, "", location.pathname);
    }
    if (token) {
      setSetup(token);
      history.replaceState(null, "", location.pathname);
    }
  }, [localPreview]);
  async function go() {
    setBusy(true);
    setError("");
    try {
      if (localPreview) {
        const r = await fetch("/api/auth/dev-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: devToken }),
        });
        if (!r.ok) throw new Error((await r.json()).error);
        location.reload();
        return;
      }
      const kind = setup ? "register" : "login";
      const r = await fetch(`/api/auth/${kind}-options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: setup }),
      });
      const options = await r.json();
      if (!r.ok) throw new Error(options.error);
      const response = setup
        ? await startRegistration({ optionsJSON: options })
        : await startAuthentication({ optionsJSON: options });
      const verify = await fetch(`/api/auth/${kind}-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(response),
      });
      if (!verify.ok) throw new Error((await verify.json()).error);
      location.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in was cancelled. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <div className="login-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="login-flutes" aria-hidden="true" />
      <svg className="login-ribbons" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="ribbon-glass" x1="0" y1="0" x2="0.2" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.8" />
            <stop offset="0.12" stopColor="#c5f5e5" stopOpacity="0.22" />
            <stop offset="0.48" stopColor="white" stopOpacity="0.06" />
            <stop offset="0.85" stopColor="#c3b6ed" stopOpacity="0.2" />
            <stop offset="1" stopColor="white" stopOpacity="0.72" />
          </linearGradient>
        </defs>
        <g className="glass-ribbon ribbon-one">
          <path d="M-160 190 C100 60 300 290 580 180 S950 100 1160 230 S1460 300 1770 180 L1770 265 C1460 390 1330 340 1120 290 S810 150 570 240 S180 155 -160 290Z" />
        </g>
        <g className="glass-ribbon ribbon-two">
          <path d="M-180 510 C80 340 300 620 590 490 S890 430 1120 540 S1470 460 1780 550 L1780 625 C1460 540 1340 670 1090 600 S820 500 590 555 S150 430 -180 610Z" />
        </g>
        <g className="glass-ribbon ribbon-three">
          <path d="M-160 850 C100 640 370 970 650 830 S960 790 1190 870 S1520 760 1770 830 L1770 910 C1480 840 1420 1000 1160 930 S930 850 650 900 S210 750 -160 960Z" />
        </g>
      </svg>
      <div className="login-brand">
        <Image className="oryx-logo" src="/app-mark.svg" alt="" width={40} height={40} /> ORYX
      </div>
      <div className="login-card">
        <button onClick={go} disabled={busy || (localPreview && !devToken)}>
          <Fingerprint size={20} />
          {localPreview
            ? busy
              ? "Opening preview…"
              : devToken
                ? "Open local preview"
                : "Open your private preview link"
            : busy
              ? "Waiting for your passkey…"
              : setup
                ? "Set up your passkey"
                : "Sign in with passkey"}
          <ArrowUpRight size={18} />
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
