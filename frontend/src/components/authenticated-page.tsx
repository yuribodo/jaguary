"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { RefreshCwIcon, ShieldCheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { boundApi } from "@/lib/bound-api";

type AuthState = "checking" | "authenticated" | "redirecting" | "error";

export function AuthenticatedPage({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    void boundApi.getPrincipalSession(controller.signal).then(({ data }) => {
      if (data.authenticated) {
        setState("authenticated");
        return;
      }

      setState("redirecting");
      router.replace("/login");
    }).catch(() => {
      if (!controller.signal.aborted) setState("error");
    });

    return () => controller.abort();
  }, [router]);

  if (state === "authenticated") return children;

  return (
    <main className="grid min-h-dvh place-items-center bg-panel px-6 text-foreground">
      <div className="max-w-sm text-center" role={state === "error" ? "alert" : "status"}>
        <span className="mx-auto grid size-10 place-items-center rounded-xl border bg-background">
          <ShieldCheckIcon className="size-4.5" strokeWidth={1.7} />
        </span>
        {state === "error" ? (
          <>
            <h1 className="mt-5 text-xl font-semibold">Could not verify your session</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Check that the Jaguary API is running and try again.</p>
            <Button className="mt-5 min-h-11" onClick={() => window.location.reload()} variant="outline">
              <RefreshCwIcon /> Try again
            </Button>
          </>
        ) : (
          <>
            <RefreshCwIcon className="mx-auto mt-5 size-4 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {state === "redirecting" ? "Redirecting to sign in…" : "Checking your session…"}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
