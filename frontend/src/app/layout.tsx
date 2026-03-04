import Sidebar from '@/components/ui/Sidebar';
import { Inter } from "next/font/google";
import { RefreshProvider } from '@/components/RefreshProvider';
import HeaderRefreshButton from '@/components/ui/HeaderRefreshButton';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
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
      <body className={`${inter.className} bg-slate-900 text-slate-50 min-h-screen flex`}>
        <RefreshProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col ml-64 overflow-hidden h-screen">
            <header className="h-16 flex items-center justify-end px-8 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-xl z-20">
              <HeaderRefreshButton />
            </header>
            <main className="flex-1 p-8 overflow-y-auto">
              {children}
            </main>
          </div>
        </RefreshProvider>
      </body>
    </html>
  );
}
