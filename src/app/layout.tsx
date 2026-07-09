import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "./_components/ThemeScript";
import { AppHeader } from "./_components/AppHeader";
import { AppSidebar } from "./_components/AppSidebar";

// DESIGN.md's documented substitute for the licensed CoinbaseSans/Display typefaces.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

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
    <html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable} ${jbMono.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <AppSidebar />
        <div className="flex min-h-screen flex-col md:pl-64">
          <AppHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
