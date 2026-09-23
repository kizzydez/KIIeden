import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import Nav from "@/components/Nav";
import Banners from "@/components/Banners";
import Background from "@/components/Background";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import TestnetBanner from "@/components/TestnetBanner";
import FloatingContact from "@/components/FloatingContact";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kiieden.example";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "KiiEden — NFT + RWA Marketplace on KiiChain", template: "%s | KiiEden" },
  description: "Launch, mint and trade NFT collections and fractional real-world assets on KiiChain. Wallet-only, with media stored on IPFS.",
  applicationName: "KiiEden",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.png", apple: "/apple-icon.png" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "KiiEden",
    title: "KiiEden — NFT + RWA Marketplace on KiiChain",
    description: "Launch, mint and trade NFT collections and fractional real-world assets on KiiChain.",
    images: ["/icon-512.png"],
  },
  twitter: {
    card: "summary",
    title: "KiiEden — NFT + RWA Marketplace on KiiChain",
    description: "Launch, mint and trade NFT collections and fractional real-world assets on KiiChain.",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050409",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html lang="en" className={`dark ${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" nonce={nonce}>
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="font-sans">
        <ThemeProvider>
        <Providers>
        <ConfirmProvider>
          <a href="#main" className="skip-link">
            Skip to main content
          </a>
          <Background />
          <div className="relative z-10">
            <TestnetBanner />
            <Nav />
            <Banners />
            <main id="main" tabIndex={-1} className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 min-h-[70vh]">
              {children}
            </main>
            <Footer />
            <CookieConsent />
            <FloatingContact />
          </div>
        </ConfirmProvider>
        </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
