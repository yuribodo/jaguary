"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon, BadgeCheckIcon, FingerprintIcon, LockKeyholeIcon, RefreshCwIcon } from "lucide-react";

import { AccountPageShell } from "@/components/account-page-shell";
import { PendingVerificationControls } from "@/components/trust/PendingVerificationControls";
import { Button } from "@/components/ui/button";
import {
  boundApi,
  BoundApiError,
  createRequestIdentity,
  type AgentAssurance,
  type AuthenticatedPrincipalSession,
  type PrincipalSessionView,
} from "@/lib/bound-api";

const AGENT_ID = "agent_travelbot";

const statusContent: Record<string, { badge: string; title: string; description: string }> = {
  PENDING: { badge: "PENDING", title: "Identity verification not complete", description: "Finish the open Didit check. If the verification page did not open or was closed, restart it here." },
  VERIFIED: { badge: "VERIFIED", title: "Your identity is verified", description: "Your TravelBot profile can authorize purchases with verified identity." },
  REJECTED: { badge: "REJECTED", title: "Identity could not be verified", description: "The provider could not approve the submitted evidence. Start a new verification to try again." },
  EXPIRED: { badge: "EXPIRED", title: "Identity verification expired", description: "A new identity check is required before you can authorize purchases with TravelBot." },
  REVOKED: { badge: "REVOKED", title: "Identity verification revoked", description: "This assurance is no longer valid. Start a new verification to restore access." },
  ERROR: { badge: "UNAVAILABLE", title: "Verification status unavailable", description: "The identity provider could not be reached. Refresh the status or try again shortly." },
};

function formatEvidenceDate(value: string | null | undefined) {
  if (!value) return "Not issued";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function formatAssuranceClaim(value: AgentAssurance["assurance_claims"][number]) {
  if (value === "PRINCIPAL_IDENTITY" || value === "OPERATOR_IDENTITY") return "customer identity";
  return value.replaceAll("_", " ").toLowerCase();
}

function PageIntro() {
  return (
    <div className="max-w-2xl border-b pb-8">
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Account / trust</p>
      <h1 className="mt-3 text-4xl leading-none [font-family:var(--font-display)] md:text-5xl">Identity &amp; trust</h1>
      <p className="mt-5 text-base leading-7 text-muted-foreground">Manage your identity verification for TravelBot purchases. This verification belongs to your account, not to the shared agent.</p>
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-t py-4 first:border-t-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-8">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 break-all text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

export default function TrustPage() {
  const [session, setSession] = useState<PrincipalSessionView>();
  const [assurance, setAssurance] = useState<AgentAssurance>();
  const [consent, setConsent] = useState(false);
  const [showReverification, setShowReverification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();

  const bootstrap = useCallback(async () => {
    let nextSession: PrincipalSessionView;
    try {
      nextSession = (await boundApi.getPrincipalSession()).data;
    } catch {
      setLoadError("Could not load the authentication session.");
      return;
    }

    setLoadError(undefined);
    setSession(nextSession);
    if (!nextSession.authenticated) {
      setAssurance(undefined);
      return;
    }

    try {
      setAssurance((await boundApi.getAgentAssurance(AGENT_ID)).data);
    } catch (reason) {
      setLoadError(reason instanceof BoundApiError && reason.status === 404
        ? "TravelBot is not linked to this principal."
        : "Could not load the current trust record.");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(bootstrap);
  }, [bootstrap]);

  useEffect(() => {
    const reloadVisibleState = () => {
      if (document.visibilityState === "visible") void bootstrap();
    };
    window.addEventListener("focus", reloadVisibleState);
    document.addEventListener("visibilitychange", reloadVisibleState);
    const interval = assurance?.attestation_status === "PENDING" ? window.setInterval(reloadVisibleState, 4_000) : undefined;
    return () => {
      window.removeEventListener("focus", reloadVisibleState);
      document.removeEventListener("visibilitychange", reloadVisibleState);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [assurance?.attestation_status, bootstrap]);

  async function beginVerification(authenticated: AuthenticatedPrincipalSession) {
    setBusy(true);
    setError(undefined);
    try {
      const { data } = await boundApi.startAgentAttestation(AGENT_ID, authenticated.csrf_token, createRequestIdentity("kya_start"));
      if (data.hosted_verification_url !== null) {
        const hosted = new URL(data.hosted_verification_url);
        const localFake = hosted.protocol === "http:" && ["localhost", "127.0.0.1"].includes(hosted.hostname);
        if (!(hosted.protocol === "https:" && hosted.hostname === "verify.didit.me") && !localFake) throw new Error("Unsafe hosted verification URL");
        window.open(hosted.toString(), "_blank", "noopener,noreferrer");
      }
      setConsent(false);
      setShowReverification(false);
      await bootstrap();
    } catch (reason) {
      setError(reason instanceof BoundApiError ? reason.message : "Verification could not be started safely.");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(authenticated: AuthenticatedPrincipalSession) {
    setBusy(true);
    setError(undefined);
    try {
      await boundApi.refreshAgentAttestation(AGENT_ID, authenticated.csrf_token, createRequestIdentity("kya_refresh"));
      await bootstrap();
    } catch (reason) {
      setError(reason instanceof BoundApiError ? reason.message : "Verification status could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout(authenticated: AuthenticatedPrincipalSession) {
    setBusy(true);
    try {
      await boundApi.logoutPrincipal(authenticated.csrf_token, createRequestIdentity("logout"));
      setSession({ authenticated: false });
      setAssurance(undefined);
      setLoadError(undefined);
    } catch {
      setError("Logout failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <AccountPageShell activePage="trust">
        <PageIntro />
        {loadError ? (
          <section role="alert" className="mt-8 rounded-xl border bg-card p-6 shadow-xs">
            <h2 className="text-2xl [font-family:var(--font-display)]">Trust record unavailable</h2>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-5 min-h-11" variant="outline" onClick={() => void bootstrap()}><RefreshCwIcon /> Try again</Button>
          </section>
        ) : (
          <div aria-live="polite" className="mt-8 flex min-h-40 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground shadow-xs">
            <RefreshCwIcon className="mr-2 size-4 animate-spin" /> Reading the trust record…
          </div>
        )}
      </AccountPageShell>
    );
  }

  if (!session.authenticated) {
    return (
      <AccountPageShell activePage="trust">
        <PageIntro />
        <section className="mt-8 rounded-xl border bg-card p-6 shadow-xs">
          <h2 className="text-2xl [font-family:var(--font-display)]">Sign in to view identity assurance</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Jaguary must identify you before showing or changing your verification.</p>
          <Button className="mt-5 min-h-11" nativeButton={false} render={<Link href="/login" />}>Sign in <ArrowRightIcon /></Button>
        </section>
      </AccountPageShell>
    );
  }

  if (loadError && !assurance) {
    return (
      <AccountPageShell activePage="trust">
        <PageIntro />
        <section role="alert" className="mt-8 rounded-xl border bg-card p-6 shadow-xs">
          <h2 className="text-2xl [font-family:var(--font-display)]">Trust record unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-5 min-h-11" variant="outline" onClick={() => void bootstrap()}><RefreshCwIcon /> Try again</Button>
        </section>
        <button className="mt-5 min-h-11 px-1 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground" disabled={busy} onClick={() => void logout(session)} type="button">Log out</button>
      </AccountPageShell>
    );
  }

  const verified = assurance?.attestation_status === "VERIFIED";
  const pending = assurance?.attestation_status === "PENDING";
  const status = assurance?.attestation_status ? statusContent[assurance.attestation_status] : {
    badge: "ACTION REQUIRED",
    title: "Verify your identity",
    description: "Complete a provider-hosted identity check before authorizing purchases with TravelBot.",
  };
  const content = verified
    ? { ...status, description: `${session.principal.display_name} can authorize TravelBot purchases with verified identity.` }
    : status;

  return (
    <AccountPageShell activePage="trust">
      <PageIntro />

      <section className="mt-8 rounded-xl border bg-card p-5 shadow-xs md:p-6">
        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center lg:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span className={`grid size-11 place-items-center rounded-full border bg-background ${verified ? "text-emerald-800" : "text-[#334de8]"}`}>
            {verified ? <BadgeCheckIcon className="size-5" /> : <FingerprintIcon className="size-5" />}
          </span>
          <div className="min-w-0">
            <span className={`inline-flex rounded-full px-2 py-1 font-mono text-[10px] ${verified ? "bg-emerald-950/8 text-emerald-900" : pending ? "bg-blue-950/8 text-blue-900" : "bg-secondary text-foreground"}`}>{content.badge}</span>
            <h2 className="mt-2 text-2xl [font-family:var(--font-display)]">{content.title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{content.description}</p>
          </div>
          <div className="sm:col-start-2 lg:col-start-3 lg:row-start-1">
            {verified && !showReverification ? (
              <div className="grid gap-2 sm:flex">
                <Button className="min-h-11 w-full px-4 sm:w-auto" nativeButton={false} render={<Link href="/demo" />}>Continue to TravelBot <ArrowRightIcon /></Button>
                <Button
                  className="min-h-11 w-full px-4 sm:w-auto"
                  disabled={busy}
                  onClick={() => {
                    setConsent(false);
                    setShowReverification(true);
                  }}
                  variant="outline"
                >
                  <FingerprintIcon /> Verify again
                </Button>
              </div>
            ) : verified ? (
              <div className="grid gap-2 sm:flex">
                <Button className="min-h-11 w-full px-4 sm:w-auto" disabled={!consent || busy} onClick={() => void beginVerification(session)}>
                  {busy ? "Opening Didit…" : "Start new check"}
                </Button>
                <Button
                  className="min-h-11 w-full px-4 sm:w-auto"
                  disabled={busy}
                  onClick={() => {
                    setConsent(false);
                    setShowReverification(false);
                  }}
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            ) : pending ? (
              <PendingVerificationControls
                busy={busy}
                consent={consent}
                restarting={showReverification}
                onCancel={() => {
                  setConsent(false);
                  setShowReverification(false);
                }}
                onConsentChange={setConsent}
                onRefresh={() => void refresh(session)}
                onRestart={() => {
                  setConsent(false);
                  setShowReverification(true);
                }}
                onStart={() => void beginVerification(session)}
              />
            ) : (
              <Button className="min-h-11 w-full px-4 sm:w-auto" disabled={!consent || busy} onClick={() => void beginVerification(session)}>{busy ? "Opening Didit…" : "Verify with Didit"}</Button>
            )}
          </div>
        </div>

        {((!verified && !pending) || (verified && showReverification)) && (
          <label className="mt-5 flex items-start gap-3 border-t pt-4 text-sm leading-6 text-muted-foreground sm:ml-16">
            <input className="mt-1.5 size-4 accent-[#334de8]" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>
              {verified && showReverification
                ? "I understand that the new Didit check becomes the current verification while it is in progress. The existing audit history is preserved."
                : "I consent to opening Didit for identity verification. Jaguary retains only the normalized decision and cryptographic evidence hashes."}
            </span>
          </label>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Current assurance</p>
          {assurance?.attestation_id && (
            <button className="inline-flex min-h-11 items-center gap-2 px-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={busy} onClick={() => void refresh(session)} type="button">
              <RefreshCwIcon className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> {busy ? "Refreshing…" : "Refresh status"}
            </button>
          )}
        </div>
        <dl className="rounded-xl border bg-card px-5 shadow-xs md:px-6">
          <DetailRow label="Provider" value={assurance?.provider ?? "Not connected"} />
          <DetailRow label="Assurance" value={assurance?.assurance_claims.length ? assurance.assurance_claims.map(formatAssuranceClaim).join(", ") : "No external claim recorded"} />
          <DetailRow label="Agent" value="TravelBot" />
          <DetailRow label="Attestation" value={assurance?.attestation_id ?? "Not issued"} mono />
          <DetailRow label="Issued" value={formatEvidenceDate(assurance?.issued_at)} />
          <DetailRow label="Expires" value={formatEvidenceDate(assurance?.expires_at)} />
        </dl>
      </section>

      <footer className="mt-5 flex flex-wrap items-start justify-between gap-4 text-xs leading-5 text-muted-foreground">
        <p className="flex items-start gap-2"><LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" />Documents and biometric media remain with the identity provider.</p>
        <button className="min-h-11 px-1 underline decoration-border underline-offset-4 hover:text-foreground" disabled={busy} onClick={() => void logout(session)} type="button">Log out</button>
      </footer>

      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
    </AccountPageShell>
  );
}
