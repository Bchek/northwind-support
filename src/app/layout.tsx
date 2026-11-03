import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Northwind Support · Vercel solution demo", template: "%s · Northwind Support" },
  description:
    "A durable AI support agent on Vercel that works with Northwind Outfitters' existing AWS order platform.",
};

// The layout reads no request data, so the nav and page chrome prerender into the static shell.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
