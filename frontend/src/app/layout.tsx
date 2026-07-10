import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { RefreshProvider } from "@/components/RefreshProvider";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import LayoutShell from "@/components/ui/LayoutShell";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "JupeTrack | MX204 Monitoring",
  description: "Advanced BGP Routing and Policy Monitoring Dashboard for Juniper MX204",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Let ThemeProvider manage the .dark class
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${outfit.variable} ${jetbrainsMono.variable} bg-background film-grain bg-grid-pattern text-on-surface antialiased h-screen w-screen overflow-hidden flex transition-colors duration-300`}>
        <ThemeProvider>
          <AuthProvider>
            <RefreshProvider>
              <WebSocketProvider>
                <LayoutShell>{children}</LayoutShell>
              </WebSocketProvider>
            </RefreshProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
