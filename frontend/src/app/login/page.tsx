"use client";

import Link from "next/link";
import { useEffect, useState, type SVGProps } from "react";
import { ArrowRightIcon, LockKeyholeIcon, LogOutIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiUrl, boundApi, createRequestIdentity, type PrincipalSessionView } from "@/lib/bound-api";

function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" {...props}>
      <path d="M21.805 12.23c0-.71-.064-1.394-.182-2.05H12v3.88h5.499a4.7 4.7 0 0 1-2.04 3.083v2.518h3.303c1.934-1.78 3.043-4.404 3.043-7.431Z" fill="#4285F4" />
      <path d="M12 22c2.76 0 5.073-.915 6.762-2.339l-3.303-2.518c-.915.613-2.085.975-3.459.975-2.663 0-4.918-1.799-5.725-4.217H2.86v2.6A10.22 10.22 0 0 0 12 22Z" fill="#34A853" />
      <path d="M6.275 13.901A6.15 6.15 0 0 1 5.955 12c0-.66.113-1.302.32-1.901v-2.6H2.86A10 10 0 0 0 1.805 12c0 1.61.385 3.136 1.055 4.501l3.415-2.6Z" fill="#FBBC05" />
      <path d="M12 5.882c1.5 0 2.848.516 3.91 1.529l2.926-2.927C17.068 2.836 14.755 2 12 2a10.22 10.22 0 0 0-9.14 5.499l3.415 2.6C7.082 7.681 9.337 5.882 12 5.882Z" fill="#EA4335" />
    </svg>
  );
}

export default function LoginPage() {
  const [session, setSession] = useState<PrincipalSessionView>();
  const [loading, setLoading] = useState(true);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.getPrincipalSession(controller.signal).then(({ data }) => {
      setSession(data);
      setLoading(false);
    }).catch(() => {
      if (controller.signal.aborted) return;
      setError("Could not load the authentication session.");
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  async function retry() {
    setLoading(true);
    setError(undefined);
    try {
      setSession((await boundApi.getPrincipalSession()).data);
    } catch {
      setError("Could not load the authentication session.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (!session?.authenticated || logoutBusy) return;

    setLogoutBusy(true);
    setError(undefined);
    try {
      await boundApi.logoutPrincipal(session.csrf_token, createRequestIdentity("logout_login"));
      setSession({ authenticated: false });
    } catch {
      setError("Could not log out. Please try again.");
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-panel px-6 py-12 text-foreground">
      <section className="w-full max-w-[22.5rem] text-center">
        <Link className="inline-flex items-center gap-2.5" href="/">
          <span className="grid size-10 place-items-center rounded-xl border bg-background">
            <ShieldCheckIcon className="size-4.5" strokeWidth={1.7} />
          </span>
          <span className="text-3xl leading-none [font-family:var(--font-serif)]">Jaguary</span>
        </Link>

        <div className="mt-20 sm:mt-24">
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">
            {session?.authenticated ? `Welcome back, ${session.principal.display_name}` : "Welcome to Jaguary"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session?.authenticated ? "Your operator session is ready." : "Sign in as the operator to continue"}
          </p>

          {session?.authenticated ? (
            <div className="mt-8 grid gap-3">
              <Button className="min-h-12 w-full" nativeButton={false} render={<Link href="/trust" />}>
                Continue to Jaguary <ArrowRightIcon />
              </Button>
              <Button
                className="min-h-11 w-full"
                disabled={logoutBusy}
                onClick={() => void logout()}
                variant="outline"
              >
                {logoutBusy ? <RefreshCwIcon className="animate-spin" /> : <LogOutIcon />}
                {logoutBusy ? "Logging out…" : "Log out"}
              </Button>
            </div>
          ) : (
            <Button
              className="mt-8 min-h-12 w-full bg-background text-foreground shadow-none hover:bg-secondary"
              disabled={loading}
              nativeButton={false}
              render={<a href={`${apiUrl}/auth/v1/login/google/start?return_to=%2Fauth%2Fcallback`} />}
              variant="outline"
            >
              {loading ? <RefreshCwIcon className="animate-spin" /> : <GoogleIcon className="size-5" />}
              {loading ? "Checking session…" : "Continue with Google"}
            </Button>
          )}

          <div className="mx-auto mt-10 max-w-xs text-xs leading-5 text-muted-foreground">
            <LockKeyholeIcon className="mx-auto mb-3 size-4" />
            <p>Your session is secured in an HttpOnly cookie. Jaguary never stores Google tokens in browser storage.</p>
          </div>

          {error && (
            <div className="mt-6" role="alert">
              <p className="text-sm text-destructive">{error}</p>
              <button className="mt-2 min-h-11 px-2 text-sm underline underline-offset-4" onClick={() => void retry()} type="button">Try again</button>
            </div>
          )}

          <Link className="mt-10 inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground" href="/">Back to home</Link>
        </div>
      </section>
    </main>
  );
}
