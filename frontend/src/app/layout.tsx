import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Bound — Agentic commerce trust layer",
  description:
    "Bound verifies delegated authority before an AI agent can execute a payment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
