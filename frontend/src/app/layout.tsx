import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { RefreshProvider } from "@/components/RefreshProvider";
import { WebSocketProvider } from "@/components/WebSocketProvider";
import LayoutShell from "@/components/ui/LayoutShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JupeTrack | MX204 Monitoring",
  description: "Advanced BGP Routing and Policy Monitoring Dashboard for Juniper MX204",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-900 text-slate-50 min-h-screen`}>
        <AuthProvider>
          <RefreshProvider>
            <WebSocketProvider>
              <LayoutShell>{children}</LayoutShell>
            </WebSocketProvider>
          </RefreshProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
