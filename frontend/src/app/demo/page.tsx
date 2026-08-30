import type { Metadata } from "next";

import { TrustedSurface } from "@/components/trusted-surface";

export const metadata: Metadata = {
  title: "Bound — converse, limit, authorize",
  description:
    "Talk to an identified agent and control limited, revocable authority.",
};

export default function DemoPage() {
  return <TrustedSurface />;
}
