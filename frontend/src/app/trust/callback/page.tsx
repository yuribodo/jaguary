"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TrustCallbackPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/trust"); }, [router]);
  return <main className="grid min-h-dvh place-items-center"><p className="text-sm text-muted-foreground">Returning to the sanitized trust status…</p></main>;
}
