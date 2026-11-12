import "./theme.css";
import "./legacy.css";
import "./tailwind.css";
import "./surfaces.css";
import "./workflow-fixes.css";
import type { Metadata, Viewport } from "next";
import "./journal-guide.css";
import "./reading-room.css";
import "./stillness-library.css";
import "./reading-room-preparation.css";
import "./reading-room-done.css";
import "./theme-ui.css";
export const metadata: Metadata = {
  title: "Still Signal — Awareness before action.",
  description:
    "A personal awareness layer for traders. Synchronize live heart rate, trading events, and your own reflections.",
  robots: { index: false, follow: false },
  applicationName: "Still Signal",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EF" },
    { media: "(prefers-color-scheme: dark)", color: "#1B1922" },
  ],
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
