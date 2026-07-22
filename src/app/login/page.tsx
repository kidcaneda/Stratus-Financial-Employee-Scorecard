"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { provisionMe } from "@/lib/employee-actions";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      // Create the account on sign-up, otherwise sign in.
      if (mode === "signup") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }

      // Sync access from the company directory (role + department +
      // employee link). Refreshes the token if the role claim changed.
      const prov = await provisionMe();
      if (!prov.ok) {
        // Account exists but isn't authorized — don't leave them signed in.
        await auth.signOut();
        setError(prov.error || "Your email isn't authorized for access.");
        return;
      }

      const token = await auth.currentUser?.getIdToken();
      if (token) {
        document.cookie = `__session=${token}; path=/; max-age=3600; samesite=lax`;
      }
      router.push(params.get("from") || "/dashboard");
    } catch (e: any) {
      const code = e?.code || "";
      if (code === "auth/email-already-in-use")
        setError("An account with this email already exists — sign in instead.");
      else if (code === "auth/weak-password")
        setError("Password should be at least 6 characters.");
      else if (code === "auth/invalid-email") setError("That doesn't look like a valid email.");
      else if (mode === "signup") setError("Couldn't create the account. Try again.");
      else setError("Couldn't sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
            <span className="font-display">S</span>
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-ink">Stratus Scorecard</div>
            <div className="text-xs text-ink-muted">Sign in to continue</div>
          </div>
        </div>

        <div className="card animate-scale-in space-y-4 p-6">
          {/* Sign in / Create account toggle */}
          <div className="flex rounded-lg border border-hairline bg-panel-2 p-0.5 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === m ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Company email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="you@stratus.finance"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-hairline bg-panel-2 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder={mode === "signup" ? "Choose a password (6+ characters)" : "••••••••"}
            />
          </div>
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <button onClick={handleSubmit} disabled={busy} className="btn-primary w-full">
            {busy
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
              ? "Create account & sync access"
              : "Sign in"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-ink-muted">
          {mode === "signup"
            ? "Use your @stratus.finance email — your role and team are set up automatically."
            : "New here? Create an account with your company email to get access."}
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-canvas">
          <div className="text-sm text-ink-muted">Loading…</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
