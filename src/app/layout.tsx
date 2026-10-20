import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";
import "./signal.css";
export const metadata: Metadata = {
  title: "Still Signal — Awareness before action.",
  description:
    "A personal awareness layer for traders. Synchronize live heart rate, trading events, and your own reflections.",
  robots: { index: false, follow: false },
  applicationName: "Still Signal",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: "#080c0e",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
