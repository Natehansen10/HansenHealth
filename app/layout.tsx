import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { InAppBrowserBanner } from "@/components/layout/in-app-browser-banner";

const barlow = Barlow({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Hansen Health",
  description: "Track exercise goals together as a family.",
  // Web App Manifest (see app/manifest.ts) drives Add-to-Home-Screen /
  // install in Chrome + Android.
  manifest: "/manifest.webmanifest",
  // iOS home-screen install uses these apple-* hints, not the manifest:
  // the touch icon and standalone ("web app capable") behavior.
  appleWebApp: {
    capable: true,
    title: "Hansen Health",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d2d3d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <InAppBrowserBanner />
        {children}
      </body>
    </html>
  );
}
