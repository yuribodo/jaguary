import type { Metadata } from "next";

import { TrustedSurface } from "@/components/trusted-surface";

export const metadata: Metadata = {
  title: "Bound — converse, limite, autorize",
  description:
    "Converse com um agente identificado e controle uma autoridade limitada e revogável.",
};

export default function DemoPage() {
  return <TrustedSurface />;
}
