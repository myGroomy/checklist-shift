import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/lib/query/client";
import { PWAProvider } from "@/components/pwa/PWAProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Checklist Shift",
  description: "PWA untuk SOP shift karyawan F&B - Checklist, Handover, Incident, Laporan",
  manifest: "/manifest.json",
  themeColor: "#1f2937",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Checklist Shift",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1f2937",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">
        <QueryProvider>
          <PWAProvider>{children}</PWAProvider>
        </QueryProvider>
      </body>
    </html>
  );
}