import type { Metadata } from "next";

import { TrustedSurface } from "@/components/trusted-surface";

export const metadata: Metadata = {
  title: "JaguaryAI — nova conversa",
  description:
    "Converse com o Jaguary e controle uma autoridade limitada e revogável.",
};

export default function DemoPage() {
  return <TrustedSurface />;
}
