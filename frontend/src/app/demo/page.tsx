import type { Metadata } from "next";

import { TrustedSurface } from "@/components/trusted-surface";

export const metadata: Metadata = {
  title: "JaguaryAI — new conversation",
  description:
    "Chat with Jaguary and control a limited, revocable permission.",
};

export default function DemoPage() {
  return <TrustedSurface />;
}
