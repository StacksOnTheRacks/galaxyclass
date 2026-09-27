import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { SessionProvider } from "@/lib/auth/session";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Galaxy Class Gaming — Games worth sitting down for",
  description:
    "Galaxy Class Gaming is an independent studio making social games that are functional first and fun always. Our first table is Riffle — no-limit Texas Hold'em with play chips.",
  openGraph: {
    title: "Galaxy Class Gaming",
    description:
      "Independent game studio. Riffle: real no-limit Hold'em with your people, play chips only.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="min-h-screen overflow-x-hidden">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
