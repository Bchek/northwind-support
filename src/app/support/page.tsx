import type { Metadata } from "next";
import { Suspense } from "react";
import { SupportChat } from "@/components/support-chat";
import { getCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Customer chat" };

// The shell (nav, layout) is static. Reading the session cookie is request-time data,
// so it sits behind Suspense and streams in; with Cache Components this split is
// enforced at build time.
export default function SupportPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 text-sm text-gray-400">Loading…</div>}>
      <WithSession />
    </Suspense>
  );
}

async function WithSession() {
  const customer = await getCustomer();
  return <SupportChat initialCustomerId={customer?.id} />;
}
