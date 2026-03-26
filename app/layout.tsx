import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

<a
  href="/login"
  className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
>
  Login
</a>

export const metadata: Metadata = {
  title: "LoboDeals — The best video game deals",
  description: "Find cheap games, track prices, and create alerts on LoboDeals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
  <nav className="border-b border-zinc-800 bg-zinc-900">
    <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
      <a
  href="/"
  className="text-lg font-bold transition hover:text-emerald-300"
>
  LoboDeals
</a>

      <div className="flex gap-4 text-sm">
  <a
    href="/"
    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
  >
    Home
  </a>

  <a
    href="/wishlist"
    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
  >
    Wishlist
  </a>

  <a
    href="/alerts"
    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
  >
    Alerts
  </a>

  <a
    href="/login"
    className="rounded-lg px-3 py-2 transition hover:bg-zinc-800"
  >
    Login
  </a>
</div>
    </div>
  </nav>

  {children}
</body>
    </html>
  );
}
