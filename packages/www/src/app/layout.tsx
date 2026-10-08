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
  title: "Galaxy Class Gaming — Pick a room and play",
  description:
    "Galaxy Class Gaming makes online game rooms for strangers, friends, and family. Play Riffle Poker, Scribble, Warships, or Whodunit? in your browser with social chips — nothing to buy.",
  openGraph: {
    title: "Galaxy Class Gaming",
    description:
      "Game rooms for strangers, friends, and family: Riffle Poker, Scribble, Warships, and Whodunit? Social chips only — nothing to buy.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#09080d",
  viewportFit: "cover",
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
