import type { Metadata, Viewport } from "next";
import { Bungee, Chakra_Petch, Silkscreen } from "next/font/google";
import { SessionProvider } from "@/lib/auth/session";
import "./globals.css";

const bungee = Bungee({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bungee",
  display: "swap",
});

const chakra = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

const silkscreen = Silkscreen({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-silkscreen",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Galaxy Class Gaming — Games worth sitting down for",
  description:
    "Galaxy Class Gaming makes online games for strangers, friends, and family. Play in the browser with social chips — nothing to buy. Featured game: Riffle Poker.",
  openGraph: {
    title: "Galaxy Class Gaming",
    description:
      "An arcade of online games for strangers, friends, and family. Featured: Riffle Poker. Social chips only — nothing to buy.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09080d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bungee.variable} ${chakra.variable} ${silkscreen.variable}`}
    >
      <body className="min-h-screen overflow-x-hidden">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
