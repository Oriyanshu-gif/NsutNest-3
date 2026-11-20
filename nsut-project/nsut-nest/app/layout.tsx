import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./styles/tokens.css";
import "./globals.css";
import "./nest-paper.css";
import "./home.css";
import "./palettes.css";
import { ImsLoginGate } from "./hub-shell";
import { RegisterServiceWorker } from "./install-pwa";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0F17",
};

export const metadata: Metadata = {
  title: "NsutNest | Your NSUT student hub",
  description: "Your campus, all in one place: NSUT attendance, results, notices and community.",
  manifest: "/manifest.webmanifest",
  applicationName: "NSUT Nest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "NSUT Nest" },
  icons: {
    icon: [
      { url: "/icons/mark.svg", type: "image/svg+xml" },
      { url: "/icons/nsutnest-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/nsutnest-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/nsutnest-192.png", sizes: "192x192", type: "image/png" }],
  },
};

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Sora is variable: naming weights breaks next/font's axis parsing.
const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

/**
 * Run before the first paint so a saved light theme or Hinglish locale never
 * flashes the defaults. They must be inline: React has not hydrated yet.
 */
const themeBootScript = `(function(){try{var t=window.localStorage.getItem("nsutnest-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t;}var p=window.localStorage.getItem("nsutnest-palette");if(p){document.documentElement.setAttribute("data-palette",p);}}catch(e){}})();`;

const languageBootScript = `(function(){try{var l=window.localStorage.getItem("nsutnest-language");if(l==="hinglish"){document.documentElement.lang="hi-Latn";}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-IN"
      data-theme="dark"
      data-palette="plum"
      className={`${inter.variable} ${sora.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{ __html: languageBootScript }}
          suppressHydrationWarning
        />
        {children}
        <ImsLoginGate />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
