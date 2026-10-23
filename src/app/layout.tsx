import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { NAV, ROLE_LABEL } from "@/lib/nav";
import { getSession } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LifeLine Blood Bank",
  description: "Blood component inventory and emergency matching system",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const items = session ? NAV.filter((n) => n.roles.includes(session.role)) : [];

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
            <div className="flex items-center justify-between px-5 py-4 md:block">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="inline-block h-3 w-3 rotate-45 rounded-sm bg-accent" aria-hidden />
                LifeLine
              </Link>
              {session && (
                <div className="text-right text-xs text-muted md:mt-4 md:text-left">
                  <div className="font-medium text-foreground">{session.name}</div>
                  <div>{ROLE_LABEL[session.role]}</div>
                </div>
              )}
            </div>
            {session && (
              <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
                <NavLinks items={items.map(({ href, label, owner }) => ({ href, label, owner }))} />
                <Link href="/login" className="mt-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted hover:bg-background md:mt-6">
                  Switch user
                </Link>
              </nav>
            )}
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
