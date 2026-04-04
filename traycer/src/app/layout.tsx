import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-provider";
import { MiniKitProvider } from "@/lib/minikit-provider";
import { AuthProvider } from "@/lib/auth-context";
import { BottomNav } from "@/components/bottom-nav";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Traycer",
  description:
    "Reduce food waste, earn rewards. A World Mini App for sustainable food disposal.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${geist.variable} antialiased`}>
        <ThemeProvider>
          <MiniKitProvider>
            <AuthProvider>
              <main className="mx-auto min-h-screen max-w-md pb-20">
                {children}
              </main>
              <BottomNav />
            </AuthProvider>
          </MiniKitProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
