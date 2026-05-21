import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import { BRAND_LOGO_MARK_SRC, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: `${BRAND_NAME} — ${BRAND_TAGLINE}`,
  icons: { icon: BRAND_LOGO_MARK_SRC, apple: BRAND_LOGO_MARK_SRC },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh font-sans">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute inset-0 bg-midnight-950" />
          <div className="absolute -left-[20%] top-[-15%] h-[520px] w-[640px] rounded-full bg-accent/[0.12] blur-[120px]" />
          <div className="absolute -right-[10%] top-[5%] h-[420px] w-[520px] rounded-full bg-accent/[0.06] blur-[100px]" />
          <div className="absolute bottom-[-20%] left-[30%] h-[380px] w-[480px] rounded-full bg-emerald-400/[0.04] blur-[90px]" />
        </div>
        <AppProviders>
          <div className="relative min-h-dvh">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
