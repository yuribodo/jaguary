import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { EnglishUi } from "@/components/english-ui";
import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700"],
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "JaguaryAI — authorized purchases with evidence",
  description:
    "JaguaryAI controls identity, permission scope, and evidence before any payment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={cn(geist.variable, display.variable, mono.variable)}
      lang="en"
    >
      <body>
        <TooltipProvider><EnglishUi />{children}</TooltipProvider>
      </body>
    </html>
  );
}
