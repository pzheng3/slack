import type { Metadata } from "next";
import { Lato, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SupabaseProvider } from "@/components/providers/SupabaseProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import { UsernameModal } from "@/components/UsernameModal";
import { TooltipProvider } from "@/components/ui/tooltip";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Slack Input",
  description: "A Slack-inspired chat application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${lato.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <SupabaseProvider>
          <UserProvider>
            <TooltipProvider>
              <UsernameModal />
              {children}
            </TooltipProvider>
          </UserProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
