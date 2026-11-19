import type { Metadata, Viewport } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { MotionProvider } from "@/components/motion/smooth-scroll";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
// Archivo's width axis gives the wide, heavy display grotesk seen in design.webp.
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Inhub Workspace", template: "%s · Inhub Workspace" },
  description: "Inhub E-Cell's internal workspace for people, teams, work and reports.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0c" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html lang="en-IN" data-theme={theme === "light" || theme === "dark" ? theme : undefined} className={`${geist.variable} ${geistMono.variable} ${archivo.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-md focus:bg-inverse focus:px-3 focus:py-2 focus:text-fg-inverse">
          Skip to content
        </a>
        <MotionProvider>
          <ToastProvider>{children}</ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
