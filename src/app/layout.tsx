import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScoutMaster 3.0",
  description: "App di gestione Reparto Scout - AGESCI",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    title: "ScoutMaster",
    statusBarStyle: "black-translucent",
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className="font-sans h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-surface-bg text-slate-900 selection:bg-agesci-blue selection:text-white">
        {children}
      </body>
    </html>
  );
}
