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
      <body className="min-h-dvh font-sans bg-slate-50">
        <AppProviders>
          <div className="relative min-h-dvh">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
