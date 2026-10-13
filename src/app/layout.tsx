import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Trade Pulse — Know your pulse. Understand your trades.",
  description:
    "A personal awareness layer for traders. Synchronize live heart rate, trading events, and your own reflections.",
  robots: { index: false, follow: false },
  applicationName: "Trade Pulse",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: "#101114",
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
