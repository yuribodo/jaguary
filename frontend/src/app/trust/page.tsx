"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AccountPageShell } from "@/components/account-page-shell";
import { Button } from "@/components/ui/button";
import { boundApi, BoundApiError, createRequestIdentity, type AgentAssurance, type AuthenticatedPrincipalSession, type PrincipalSessionView } from "@/lib/bound-api";

const AGENT_ID = "agent_travelbot";
const statusLabels: Record<string, string> = { PENDING: "Verification pending", VERIFIED: "Operator identity verified", REJECTED: "Verification rejected", EXPIRED: "Verification expired", REVOKED: "Verification revoked", ERROR: "Provider temporarily unavailable" };
async function loadTrustState(): Promise<{ session: PrincipalSessionView; assurance?: AgentAssurance }> {
  const session = (await boundApi.getPrincipalSession()).data;
  return session.authenticated ? { session, assurance: (await boundApi.getAgentAssurance(AGENT_ID)).data } : { session };
}

export default function TrustPage() {
  const [session, setSession] = useState<PrincipalSessionView>();
  const [assurance, setAssurance] = useState<AgentAssurance>();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const bootstrap = useCallback(async () => {
    const next = await loadTrustState();
    setSession(next.session); setAssurance(next.assurance);
  }, []);
  useEffect(() => {
    void loadTrustState().then((next) => { setSession(next.session); setAssurance(next.assurance); })
      .catch(() => setError("Could not load the current trust state."));
  }, []);

  async function beginVerification(authenticated: AuthenticatedPrincipalSession) {
    setBusy(true); setError(undefined);
    try {
      const { data } = await boundApi.startAgentAttestation(AGENT_ID, authenticated.csrf_token, createRequestIdentity("kya_start"));
      if (data.hosted_verification_url !== null) {
        const hosted = new URL(data.hosted_verification_url);
        const localFake = hosted.protocol === "http:" && ["localhost", "127.0.0.1"].includes(hosted.hostname);
        if (!(hosted.protocol === "https:" && hosted.hostname === "verify.didit.me") && !localFake) throw new Error("Unsafe hosted verification URL");
        window.open(hosted.toString(), "_blank", "noopener,noreferrer");
      }
      await bootstrap();
    } catch (reason) {
      setError(reason instanceof BoundApiError ? reason.message : "Verification could not be started safely.");
    } finally { setBusy(false); }
  }

  async function refresh(authenticated: AuthenticatedPrincipalSession) {
    setBusy(true); setError(undefined);
    try {
      await boundApi.refreshAgentAttestation(AGENT_ID, authenticated.csrf_token, createRequestIdentity("kya_refresh"));
      await bootstrap();
    } catch (reason) { setError(reason instanceof BoundApiError ? reason.message : "Verification status could not be refreshed."); }
    finally { setBusy(false); }
  }

  async function logout(authenticated: AuthenticatedPrincipalSession) {
    setBusy(true);
    try { await boundApi.logoutPrincipal(authenticated.csrf_token, createRequestIdentity("logout")); setSession({ authenticated: false }); setAssurance(undefined); }
    catch { setError("Logout failed. Please retry."); } finally { setBusy(false); }
  }

  return <AccountPageShell activePage="trust"><div className="max-w-2xl">
    <p className="panel-label">Operator assurance</p><h1 className="mt-2 text-3xl font-semibold">Identity &amp; agent trust</h1>
    {!session ? <p className="mt-6 text-sm text-muted-foreground">Loading secure session…</p> : !session.authenticated ? <div className="mt-7 rounded-xl border p-5"><p className="text-sm text-muted-foreground">Sign in before starting identity verification.</p><Button className="mt-4" render={<Link href="/login" />}>Sign in</Button></div> : <>
      <div className="mt-7 flex items-center justify-between rounded-xl border p-5"><div><p className="font-medium">{session.principal.display_name}</p><p className="mt-1 text-xs text-muted-foreground">{session.demo ? "Demo authentication — local only" : "Authenticated with Google OIDC"}</p></div><Button variant="outline" disabled={busy} onClick={() => void logout(session)}>Log out</Button></div>
      <div className="mt-5 rounded-xl border p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">TravelBot</p><p className="mt-1 text-sm text-muted-foreground">{assurance?.attestation_status ? statusLabels[assurance.attestation_status] : "No external operator attestation"}</p></div>{assurance && <span className="rounded-full bg-muted px-3 py-1 font-mono text-[10px] uppercase tracking-wider">{assurance.assurance_level.replaceAll("_", " ")}</span>}</div>
        {assurance?.assurance_claims.length ? <p className="mt-4 text-xs text-muted-foreground">Assurance: {assurance.assurance_claims.map((claim) => claim.replaceAll("_", " ").toLowerCase()).join(", ")}</p> : null}
        <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I consent to opening the configured identity provider for KYC. Bound retains only normalized hashes and status evidence.</span></label>
        <div className="mt-5 flex flex-wrap gap-3"><Button disabled={!consent || busy} onClick={() => void beginVerification(session)}>{busy ? "Working…" : assurance?.attestation_status ? "Start new verification" : "Verify operator identity"}</Button>{assurance?.attestation_id && <Button variant="outline" disabled={busy} onClick={() => void refresh(session)}>Refresh provider status</Button>}</div>
      </div>
    </>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </div></AccountPageShell>;
}
