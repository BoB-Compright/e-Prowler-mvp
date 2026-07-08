import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "./_components/ThemeScript";
import { AppHeader } from "./_components/AppHeader";
import { listRuns } from "@/lib/pipeline/runs";

// DESIGN.md's documented substitute for the licensed CoinbaseSans/Display typefaces.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Container Security Pipeline",
  description: "AI 기반 컨테이너 보안 점검 파이프라인",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Drives the header's "상세 리포트" tab: with no run-scoped selection
  // concept in this multi-page app, the most recent run is the closest
  // real equivalent of the mockup's persistent "selected repo".
  const latestRunId = listRuns()[0]?.id ?? null;

  return (
    <html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable}`}>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <AppHeader latestRunId={latestRunId} />
        {children}
      </body>
    </html>
  );
}
