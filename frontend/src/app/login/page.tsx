"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiUrl, boundApi, BoundApiError, createRequestIdentity, type PrincipalSessionView } from "@/lib/bound-api";

export default function LoginPage() {
  const [session, setSession] = useState<PrincipalSessionView>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.getPrincipalSession(controller.signal).then(({ data }) => setSession(data)).catch(() => setError("Could not load the authentication session."));
    return () => controller.abort();
  }, []);

  async function demoLogin() {
    setBusy(true); setError(undefined);
    try {
      const { data } = await boundApi.createDemoPrincipalSession(createRequestIdentity("demo_login"));
      setSession(data);
    } catch (reason) {
      setError(reason instanceof BoundApiError && reason.status === 404 ? "Demo authentication is available only in the local development mode." : "Demo login failed.");
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-dvh place-items-center bg-panel px-5 py-12">
    <section className="w-full max-w-md rounded-2xl border bg-background p-7 shadow-sm">
      <Link href="/" className="font-serif text-3xl">Bound</Link>
      <p className="panel-label mt-8">Principal authentication</p>
      <h1 className="mt-2 text-2xl font-semibold">Sign in as the operator</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Your session stays in an HttpOnly backend cookie. Bound never stores login tokens in browser storage.</p>
      {session?.authenticated ? <div className="mt-7 rounded-xl border bg-muted/40 p-4">
        <p className="font-medium">{session.principal.display_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{session.demo ? "Demo authentication" : "Google OIDC"}</p>
        <Button className="mt-4 w-full" render={<Link href="/trust" />}>Continue to identity &amp; trust</Button>
      </div> : <div className="mt-7 grid gap-3">
        <Button className="w-full" render={<a href={`${apiUrl}/auth/v1/login/google/start?return_to=%2Fauth%2Fcallback`} />}>Continue with Google</Button>
        <Button className="w-full" variant="outline" disabled={busy} onClick={() => void demoLogin()}>{busy ? "Starting demo…" : "Use local Marta demo"}</Button>
      </div>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </section>
  </main>;
}
