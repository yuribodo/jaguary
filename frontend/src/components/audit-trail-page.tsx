"use client";

import { CircleAlertIcon, FileCheck2Icon, LinkIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountPageShell } from "@/components/account-page-shell";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { AuditTimeline } from "@/lib/contracts";

function shortHash(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-10)}`;
}

async function resolveAuditTimeline(value: string): Promise<AuditTimeline> {
  let correlationId = value;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const conversation = (await boundApi.getConversation(value)).data;
    if (conversation.operation.receipt_id) correlationId = (await boundApi.getReceipt(conversation.operation.receipt_id)).data.evidence.correlation_id;
    else correlationId = conversation.messages.at(-1)?.correlation_id ?? "";
    if (!correlationId) throw new Error("This conversation has no auditable evidence yet.");
  } else if (value.startsWith("receipt_")) {
    correlationId = (await boundApi.getReceipt(value)).data.evidence.correlation_id;
  }
  return (await boundApi.getAuditTimeline(correlationId)).data;
}

export function AuditTrailPage({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [timeline, setTimeline] = useState<AuditTimeline>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(Boolean(initialQuery));

  useEffect(() => {
    if (!initialQuery) return;
    void resolveAuditTimeline(initialQuery)
      .then(setTimeline)
      .catch((caught: unknown) => setError(caught instanceof BoundApiError ? caught.message : caught instanceof Error ? caught.message : "The audit trail could not be loaded."))
      .finally(() => setLoading(false));
  }, [initialQuery]);

  async function loadTimeline() {
    const value = query.trim();
    if (!value) return;
    setLoading(true);
    setError(undefined);
    setTimeline(undefined);
    try {
      setTimeline(await resolveAuditTimeline(value));
    } catch (caught) {
      setError(caught instanceof BoundApiError ? caught.message : caught instanceof Error ? caught.message : "The audit trail could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccountPageShell activePage="audit">
      <div className="max-w-2xl border-b pb-8"><p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Account / evidence</p><h1 className="mt-3 text-5xl [font-family:var(--font-display)]">Audit trail</h1><p className="mt-5 leading-7 text-muted-foreground">Load persisted evidence using a conversation, receipt, or correlation ID.</p></div>
      <section className="mt-8 rounded-xl border bg-card p-5 shadow-xs"><label className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase" htmlFor="audit-query">Conversation, receipt, or correlation ID</label><div className="mt-3 flex flex-col gap-3 sm:flex-row"><input className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 font-mono text-sm outline-none" id="audit-query" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadTimeline(); }} placeholder="UUID, receipt_…, or corr_…" value={query} /><button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!query.trim() || loading} onClick={() => void loadTimeline()} type="button"><SearchIcon className="size-4" />{loading ? "Loading…" : "Load trail"}</button></div></section>
      {error ? <section className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><CircleAlertIcon className="size-5 shrink-0" /><div><strong>Audit trail unavailable</strong><p className="mt-1">{error}</p></div></section> : null}
      {timeline ? <section className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><h2 className="text-2xl [font-family:var(--font-display)]">{timeline.events.length} auditable events</h2><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-mono text-[10px] text-emerald-900"><ShieldCheckIcon className="size-3" /> CHAIN VERIFIED</span></div><ol className="mt-6 grid gap-4">{timeline.events.map((event, index) => <li className="rounded-xl border bg-card p-5 shadow-xs" key={event.event_id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Event {String(index + 1).padStart(2, "0")}</p><h3 className="mt-1 font-medium">{event.event_type}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(event.recorded_at).toLocaleString("en-US")}</p></div><span className="rounded-full bg-secondary px-2 py-1 font-mono text-[10px]">{event.subject_id}</span></div><dl className="mt-5 grid gap-3 border-t pt-4 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Payload hash</dt><dd className="mt-1 font-mono" title={event.payload_hash}>{shortHash(event.payload_hash)}</dd></div><div><dt className="text-muted-foreground">Previous hash</dt><dd className="mt-1 font-mono" title={event.previous_hash ?? "Chain start"}>{event.previous_hash ? shortHash(event.previous_hash) : "Chain start"}</dd></div><div className="sm:col-span-2"><dt className="text-muted-foreground">Event hash</dt><dd className="mt-1 font-mono" title={event.event_hash}>{shortHash(event.event_hash)}</dd></div></dl>{event.payload ? <details className="mt-4 rounded-lg bg-muted/60 p-3"><summary className="flex cursor-pointer items-center gap-2 text-xs font-medium"><FileCheck2Icon className="size-3.5" />Sanitized payload</summary><pre className="mt-3 overflow-x-auto text-[11px] leading-5">{JSON.stringify(event.payload, null, 2)}</pre></details> : null}</li>)}</ol><p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground"><LinkIcon className="mt-0.5 size-3.5 shrink-0" />Every event references the previous hash, and the API validates the chain before returning it.</p></section> : null}
    </AccountPageShell>
  );
}
