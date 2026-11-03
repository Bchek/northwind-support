import type { Metadata } from "next";

export const metadata: Metadata = { title: "Proposal" };

// Placeholder; the full customer-facing write-up lands in a later commit.
export default function ProposalPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Proposal</h1>
      <p className="mt-3 text-gray-600">Coming soon.</p>
    </main>
  );
}
