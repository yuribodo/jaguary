import type { Metadata } from "next";

import { AuthenticatedPage } from "@/components/authenticated-page";
import { TrustedSurface } from "@/components/trusted-surface";

export const metadata: Metadata = {
  title: "Jaguary — converse, limit, authorize",
  description:
    "Talk to an identified agent and control limited, revocable authority.",
};

export default function DemoPage() {
  if (process.env.NODE_ENV === "development") return <TrustedSurface />;
  return <AuthenticatedPage><TrustedSurface /></AuthenticatedPage>;
}
