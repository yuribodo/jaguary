"use client";

import { BotIcon, CircleAlertIcon, FingerprintIcon, KeyRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountPageShell } from "@/components/account-page-shell";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { AgentIdentity } from "@/lib/contracts";

const TRAVELBOT_ID = "agent_travelbot";

export function ConnectedAgentsPage() {
  const [agent, setAgent] = useState<AgentIdentity>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.getAgent(TRAVELBOT_ID, controller.signal)
      .then(({ data }) => setAgent(data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof BoundApiError ? caught.message : "The registered agent could not be loaded.");
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <AccountPageShell activePage="agents">
      <div className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">Account / registered agents</p>
        <h1 className="mt-3 text-5xl [font-family:var(--font-display)]">Agents</h1>
        <p className="mt-4 text-muted-foreground">Identity and cryptographic status loaded from Jaguary&apos;s agent registry.</p>
      </div>

      {!agent && !error ? <div className="mt-7 h-52 rounded-xl border bg-card motion-safe:animate-pulse" /> : null}
      {error ? <div className="mt-7 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><CircleAlertIcon className="size-5 shrink-0" />{error}</div> : null}
      {agent ? (
        <article className="mt-7 rounded-xl border bg-card p-6 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-[#3157fa] text-white"><BotIcon className="size-6" /></span>
            <span className={agent.status === "ACTIVE" ? "rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700" : "rounded bg-red-50 px-2 py-1 text-[10px] text-red-700"}>{agent.status}</span>
          </div>
          <h2 className="mt-5 text-2xl [font-family:var(--font-display)]">{agent.display_name}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{agent.agent_id}</p>
          <dl className="mt-6 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
            <div><dt className="flex items-center gap-2 text-muted-foreground"><KeyRoundIcon className="size-4" />Verification key</dt><dd className="mt-1 font-mono text-xs">{agent.verification_key.key_id} · {agent.verification_key.algorithm}</dd></div>
            <div><dt className="flex items-center gap-2 text-muted-foreground"><FingerprintIcon className="size-4" />Build fingerprint</dt><dd className="mt-1 truncate font-mono text-xs" title={agent.build_fingerprint}>{agent.build_fingerprint}</dd></div>
          </dl>
        </article>
      ) : null}
    </AccountPageShell>
  );
}
