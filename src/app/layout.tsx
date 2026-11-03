import "./legacy.css";
import "./tailwind.css";
import "./appearance-colors.css";
import "./liquid-glass.css";
import type { Metadata, Viewport } from "next";
import "./journal-guide.css";
import SharkBackground from "@/components/shark-background";
import { GlassProvider } from "@/components/glassyui/glass-provider";
import { AppearanceProvider } from "@/components/appearance-context";
import Appearance from "@/components/appearance";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <GlassProvider>
          <AppearanceProvider>
            <SharkBackground />
            {children}
            <Appearance />
          </AppearanceProvider>
        </GlassProvider>
      </body>
    </html>
  );
}
