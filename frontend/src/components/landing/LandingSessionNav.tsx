"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { boundApi, type PrincipalSessionView } from "@/lib/bound-api";

type LandingSessionNavViewProps = {
  session?: PrincipalSessionView;
  status: "checking" | "ready";
};

export function LandingSessionNavView({ session, status }: LandingSessionNavViewProps) {
  if (status !== "ready") {
    return (
      <span
        aria-label="Checking session"
        className="flex min-h-10 w-24 items-center justify-end"
        role="status"
      >
        <span aria-hidden className="h-3 w-16 animate-pulse rounded-full bg-[var(--muted-ink)]/15" />
      </span>
    );
  }

  if (!session?.authenticated) {
    return (
      <Link
        className="min-h-10 px-1 text-sm tracking-[-0.01em] transition-transform duration-[160ms] ease-[var(--ease-out)] hover:opacity-70 focus-visible:text-[var(--cobalt)] active:scale-[0.97]"
        data-landing-link
        href="/demo"
      >
        Open demo
      </Link>
    );
  }

  return (
    <Link
      aria-label={`Open dashboard for ${session.principal.display_name}`}
      className="inline-flex min-h-10 max-w-56 items-center gap-2 px-1 text-sm tracking-[-0.01em] transition-transform duration-[160ms] ease-[var(--ease-out)] hover:opacity-70 focus-visible:text-[var(--cobalt)] active:scale-[0.97]"
      data-landing-link
      href="/dashboard"
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-[var(--cobalt)]" />
      <span className="truncate">{session.principal.display_name}</span>
    </Link>
  );
}

export function LandingSessionNav() {
  const [session, setSession] = useState<PrincipalSessionView>();
  const [status, setStatus] = useState<LandingSessionNavViewProps["status"]>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const result = await boundApi.getPrincipalSession(controller.signal);
        setSession(result.data);
      } catch {
        if (controller.signal.aborted) return;
        setSession({ authenticated: false });
      } finally {
        if (!controller.signal.aborted) setStatus("ready");
      }
    }

    void loadSession();
    window.addEventListener("focus", loadSession);

    return () => {
      controller.abort();
      window.removeEventListener("focus", loadSession);
    };
  }, []);

  return <LandingSessionNavView session={session} status={status} />;
}
