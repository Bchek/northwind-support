// Small shared primitives so every screen uses the same spacing, borders, and badges.
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white ${className}`}>{children}</div>;
}

type Tone = "gray" | "green" | "amber" | "red" | "blue";
const tones: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-accent-soft text-accent",
  amber: "bg-amber-soft text-amber",
  red: "bg-red-soft text-red",
  blue: "bg-blue-soft text-blue",
};

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{children}</div>;
}

export const usd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

// Sub-cent AI costs are the point of the demo, so show them precisely.
export const microUsd = (n: number) => (n < 0 ? "—" : n < 0.01 ? `$${n.toFixed(5)}` : usd(n, 4));

export const STATUS_TONE: Record<string, Tone> = {
  PENDING_APPROVAL: "amber",
  APPROVED: "blue",
  ISSUED: "green",
  DENIED: "red",
};

export const statusLabel = (s: string) => s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
