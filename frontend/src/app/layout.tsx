import type { Metadata } from "next";
// Phase 14: self-hosted Geist (npm "geist" package) instead of next/font/google, so a
// production build never depends on reaching Google Fonts from the build machine.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: "Dame Intel — Play Draughts Online",
  description: "Play international and American draughts online: real-time games, puzzles, lessons, tournaments and game review.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
