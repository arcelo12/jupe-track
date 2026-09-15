import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import { AuthProvider } from "@/components/AuthProvider";
import { RefreshProvider } from "@/components/RefreshProvider";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import LayoutShell from "@/components/ui/LayoutShell";
import "./globals.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-heading-face" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body-face" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-data-face" });

export const metadata: Metadata = {
  title: "JupeTrack | MX204 Monitoring",
  description: "Advanced BGP Routing and Policy Monitoring Dashboard for Juniper MX204",
};

const themeInitScript = `
try {
  var validPresets = ['graphite-mono', 'signal-blue', 'network-teal', 'midnight-indigo'];
  var preset = localStorage.getItem('jupetrack-theme-preset');
  if (!preset || validPresets.indexOf(preset) === -1) {
    preset = 'graphite-mono';
  }
  var mode = localStorage.getItem('jupetrack-color-mode') || localStorage.getItem('theme');
  if (mode !== 'light' && mode !== 'dark') {
    mode = 'dark';
  }
  document.documentElement.dataset.themePreset = preset;
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.style.colorScheme = mode;
} catch (e) {
  document.documentElement.dataset.themePreset = 'graphite-mono';
  document.documentElement.classList.add('dark');
  document.documentElement.style.colorScheme = 'dark';
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${inter.variable} ${jetbrainsMono.variable} bg-background text-on-surface antialiased min-h-screen min-w-screen overflow-hidden flex`}>
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        <AuthProvider>
          <ThemeProvider>
            <RefreshProvider>
              <WebSocketProvider>
                <LayoutShell>{children}</LayoutShell>
              </WebSocketProvider>
            </RefreshProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
