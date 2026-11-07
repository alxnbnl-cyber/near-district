import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", weight: ["500", "600", "700"], display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Yielvy — Curiosity pays off.", template: "%s · Yielvy" },
  description: "Explore a town of projects and communities. Solve hunts, enter creative challenges, and earn real rewards.",
  icons: { icon: "/assets/brand/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fff9f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
