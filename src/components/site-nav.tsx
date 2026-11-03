"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/support", label: "Customer chat" },
  { href: "/console", label: "Support console" },
  { href: "/proposal", label: "Proposal" },
];

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 2 3 20h18L12 2Z" fill="currentColor" />
      <path d="M12 9.5 7.8 18h8.4L12 9.5Z" fill="white" opacity=".28" />
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo className="h-5 w-5 text-accent" />
          Northwind <span className="font-normal text-gray-500">Support</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 transition-colors ${
                  active ? "bg-gray-100 text-foreground" : "text-gray-600 hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <a
          href="https://github.com/Bchek/northwind-support"
          className="ml-auto hidden text-sm text-gray-500 hover:text-foreground sm:block"
        >
          Source ↗
        </a>
      </div>
    </header>
  );
}
