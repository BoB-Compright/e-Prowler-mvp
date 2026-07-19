import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "./_components/ThemeScript";
import { NavCollapseScript } from "./_components/NavCollapseScript";
import { AppHeader } from "./_components/AppHeader";
import { AppSidebar } from "./_components/AppSidebar";
import { CveLiveToasts } from "./_components/CveLiveToasts";
import { BrandLogo } from "./_components/BrandLogo";
import { PUBLIC_ROUTE_HEADER } from "@/lib/auth/constants";
import { getSessionUserFromCookies, requireSessionUserOrRedirect } from "@/lib/auth/serverSession";

// DESIGN.md's documented substitute for the licensed CoinbaseSans/Display typefaces.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "NH-Guardian — 자산 보안 점검",
  description: "자산(레포·서버) 보안 점검 플랫폼",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // src/proxy.ts only checked whether the session cookie was *present*; this
  // is the real, DB-backed check (docs/adr/0001-authentication-local-accounts.md,
  // section 4). It's skipped on routes proxy marked public (/login, /share/*)
  // — there we just look the session up (without redirecting) so the header
  // can still show the profile block for an already-signed-in user.
  const requestHeaders = await headers();
  const isPublicRoute = requestHeaders.get(PUBLIC_ROUTE_HEADER) === "1";
  const isShareView = requestHeaders.get("x-share-view") === "1";
  const session = isPublicRoute
    ? await getSessionUserFromCookies()
    : await requireSessionUserOrRedirect();

  return (
    <html lang="ko" data-theme="light" className={`h-full antialiased ${inter.variable} ${jbMono.variable}`}>
      <head>
        <ThemeScript />
        <NavCollapseScript />
      </head>
      <body className="min-h-full">
        {isShareView ? (
          <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-30 border-b border-border bg-surface">
              <div className="flex h-16 items-center px-4 md:px-8">
                <BrandLogo subtext />
              </div>
            </header>
            {children}
          </div>
        ) : (
          <>
            <AppSidebar />
            <div className="app-main flex min-h-screen flex-col">
              <AppHeader user={session ? { username: session.username } : null} />
              {children}
              {session && !isPublicRoute && <CveLiveToasts />}
            </div>
          </>
        )}
      </body>
    </html>
  );
}
