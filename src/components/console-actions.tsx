"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function AgentLogin({ defaultEmail, defaultPassword }: { defaultEmail: string; defaultPassword: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await fetch("/api/agent/login", { method: "POST", body: JSON.stringify({ email, password }) });
          if (!res.ok) return setError((await res.json()).error);
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Email"
        autoComplete="username"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Password"
        autoComplete="current-password"
      />
      {error && <p className="text-sm text-red">{error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-lg bg-foreground py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function DecisionButtons({ refundId }: { refundId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const decide = (approved: boolean) =>
    start(async () => {
      setError("");
      const res = await fetch(`/api/refunds/${refundId}/decision`, {
        method: "POST",
        body: JSON.stringify({ approved, note: note || undefined }),
      });
      if (!res.ok) return setError((await res.json()).error);
      // The workflow resumes asynchronously (approve -> payout). Refresh a few times so
      // the lead sees it move to Issued without reloading.
      router.refresh();
      setTimeout(() => router.refresh(), 1500);
      setTimeout(() => router.refresh(), 4000);
    });

  return (
    <div className="mt-3 space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Internal note (optional)"
        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={() => decide(true)}
          disabled={pending}
          className="flex-1 rounded-lg bg-accent py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => decide(false)}
          disabled={pending}
          className="flex-1 rounded-lg border border-gray-300 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          Deny
        </button>
      </div>
      {error && <p className="text-xs text-red">{error}</p>}
    </div>
  );
}

export function HeaderActions() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Clear all refunds so the demo starts fresh? Orders and conversation history are kept.")) return;
          start(async () => {
            await fetch("/api/demo/reset", { method: "POST" });
            router.refresh();
          });
        }}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        Reset demo refunds
      </button>
      <button
        onClick={() =>
          start(async () => {
            await fetch("/api/agent/logout", { method: "POST" });
            router.refresh();
          })
        }
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        Sign out
      </button>
    </div>
  );
}

// Lets the console pick up new escalations from the chat tab without a manual reload.
export function AutoRefresh({ ms = 6000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}
