"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/firebase";

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
      // Set a coarse session cookie for the middleware guard.
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        document.cookie = `__session=${token}; path=/; max-age=3600; samesite=lax`;
      }
      router.push(params.get("from") || "/dashboard");
    } catch {
      setError("Couldn't sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-white">
            <span className="font-display">S</span>
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-ink">Stratus Scorecard</div>
            <div className="text-xs text-ink-muted">Sign in to continue</div>
          </div>
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="you@stratusfinancial.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSignIn()}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-signal-red">{error}</p>}
          <button onClick={handleSignIn} disabled={busy} className="btn-primary w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="mt-4 text-center text-xs text-ink-muted">
          Accounts are provisioned by an administrator.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-paper">
          <div className="text-sm text-ink-muted">Loading…</div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
