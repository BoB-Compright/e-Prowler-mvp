import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "./_components/ThemeScript";
import { AppHeader } from "./_components/AppHeader";

// DESIGN.md's documented substitute for the licensed CoinbaseSans/Display typefaces.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "e-Prowler — 자산 보안 점검",
  description: "자산(레포·서버) 보안 점검 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
