import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Draughts Online - Play & Improve",
  description: "The best place to play draughts (checkers) online. 8x8 and 10x10 variants with Elo rankings and timers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#312e2b] min-h-screen`}
      >
        <div className="flex">
          <Sidebar />
          <main className="flex-1 ml-20 md:ml-32">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
