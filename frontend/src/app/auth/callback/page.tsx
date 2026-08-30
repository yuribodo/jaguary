"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { boundApi } from "@/lib/bound-api";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void boundApi.getPrincipalSession(controller.signal).then(({ data }) => {
      if (!data.authenticated) { setError(true); return; }
      router.replace("/trust");
    }).catch(() => setError(true));
    return () => controller.abort();
  }, [router]);
  return <main className="grid min-h-dvh place-items-center px-5">
    <div className="text-center">{error ? <><h1 className="text-xl font-semibold">Sign-in could not be completed</h1><p className="mt-2 text-sm text-muted-foreground">The login transaction may have expired or already been used.</p><Link className="mt-5 inline-block underline" href="/login">Try again</Link></> : <><div className="mx-auto size-6 animate-spin rounded-full border-2 border-muted border-t-foreground" aria-hidden /><p className="mt-4 text-sm text-muted-foreground">Completing secure sign-in…</p></>}</div>
  </main>;
}
