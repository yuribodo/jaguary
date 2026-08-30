import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Sora } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { EnglishUi } from "@/components/english-ui";
import { cn } from "@/lib/utils";

import "react-19-credit-card/dist/es/index.css";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: "400",
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
      className={cn(geist.variable, serif.variable, display.variable, mono.variable)}
      lang="en"
    >
      <body>
        <TooltipProvider><EnglishUi />{children}</TooltipProvider>
      </body>
    </html>
  );
}
