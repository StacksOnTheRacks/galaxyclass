import type { Metadata, Viewport } from "next";
import { Bungee, Chakra_Petch, Outfit, Silkscreen } from "next/font/google";
import { SessionProvider } from "@/lib/auth/session";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

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
  title: "Galaxy Class — Deep games you can open in a tab",
  description:
    "Galaxy Class makes larger original games, starting with Aphelion Run. The Arcade keeps Riffle Poker, Scribble, Warships, and Whodunit? in the browser.",
  openGraph: {
    title: "Galaxy Class",
    description:
      "A studio for larger games, starting with Aphelion Run. The Arcade holds Riffle Poker, Scribble, Warships, and Whodunit?.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
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
      className={`${outfit.variable} ${bungee.variable} ${chakra.variable} ${silkscreen.variable}`}
    >
      <body className="min-h-screen overflow-x-hidden">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
