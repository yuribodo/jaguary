"use client";

import { useEffect, useState } from "react";
import { CircleAlertIcon, FingerprintIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import {
  clearPendingBiometricConsent,
  readPendingBiometricConsent,
} from "@/lib/biometric-consent";

type CallbackState = "checking" | "confirming" | "error";

export default function BiometricCallbackPage() {
  const [state, setState] = useState<CallbackState>("checking");
  const [message, setMessage] = useState("Validating your live selfie against the approved onboarding…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const pending = readPendingBiometricConsent();
      if (pending === undefined) throw new BoundApiError({ message: "This biometric confirmation is missing or was already completed.", code: "biometric_consent_missing" });
      const principal = await boundApi.getPrincipalSession();
      if (!principal.data.authenticated) throw new BoundApiError({ message: "Your Jaguary session expired before biometric confirmation completed.", code: "session_expired", status: 401 });

      let status: Awaited<ReturnType<typeof boundApi.refreshMandateBiometricConsent>> | undefined;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        status = await boundApi.refreshMandateBiometricConsent(
          pending.mandateId,
          pending.consentId,
          principal.data.csrf_token,
          pending.refreshIdentity,
        );
        if (status.data.status !== "PENDING" && status.data.status !== "PREPARING") break;
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      }
      if (status?.data.status !== "VERIFIED" && status?.data.status !== "CONSUMED") {
        throw new BoundApiError({
          message: status?.data.status === "REJECTED"
            ? "The selfie did not pass liveness and face matching. The authority was not activated."
            : status?.data.status === "EXPIRED"
              ? "The selfie session expired. Return to the purchase and start a new confirmation."
              : "The biometric decision is still unavailable. The authority remains inactive.",
          code: `biometric_consent_${status?.data.status.toLowerCase() ?? "unavailable"}`,
        });
      }

      if (cancelled) return;
      setState("confirming");
      if (pending.watchId) {
        setMessage("Identity confirmed. Activating the monitoring authority you reviewed…");
        await boundApi.activateTravelWatch(pending.watchId, pending.confirmationIdentity);
      } else {
        setMessage("Identity confirmed. Activating only the authority you reviewed…");
        await boundApi.postConversationMessage(
          pending.conversationId,
          "I confirm and authorize this purchase after biometric verification.",
          principal.data.csrf_token,
          pending.confirmationIdentity,
        );
      }
      clearPendingBiometricConsent();
      window.location.replace(`/demo?conversation=${encodeURIComponent(pending.conversationId)}`);
    }

    void finish().catch((error: unknown) => {
      if (cancelled) return;
      setState("error");
      setMessage(error instanceof Error ? error.message : "Biometric confirmation could not be completed.");
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-panel px-6 text-foreground">
      <div className="w-full max-w-md rounded-xl border bg-background p-7 text-center shadow-sm" role={state === "error" ? "alert" : "status"}>
        <span className="mx-auto grid size-12 place-items-center rounded-full border bg-card">
          {state === "error" ? <CircleAlertIcon className="size-5 text-destructive" /> : state === "confirming" ? <ShieldCheckIcon className="size-5 text-emerald-700" /> : <FingerprintIcon className="size-5 text-blue-700" />}
        </span>
        <h1 className="mt-5 text-xl font-semibold">{state === "error" ? "Authority remains inactive" : state === "confirming" ? "Selfie approved" : "Checking secure consent"}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        {state === "error" ? (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => window.location.reload()}><RefreshCwIcon />Try status again</Button>
            <Button nativeButton={false} render={<Link href="/demo" />} variant="outline">Return to purchase</Button>
          </div>
        ) : <RefreshCwIcon className="mx-auto mt-6 size-4 animate-spin text-muted-foreground" />}
      </div>
    </main>
  );
}
