import { InstallPwa } from "./install-pwa";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ImsLoginGate } from "./hub-shell";
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b0e12" };
export const metadata: Metadata = {
  title: "NsutNest | Your NSUT student hub",
  description: "Your campus, all in one place: NSUT attendance, results, notices and community.",
  manifest: "/manifest.webmanifest",
  applicationName: "NSUT Nest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "NSUT Nest" },
  icons: {
    icon: [
      { url: "/icons/nsutnest-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/nsutnest-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/nsutnest-192.png", sizes: "192x192", type: "image/png" }]
  }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning>{children}<ImsLoginGate /><InstallPwa /></body></html>;
}
