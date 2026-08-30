"use client";

import Link from "next/link";
import { CircleAlertIcon, PlaneIcon, ReceiptTextIcon, RefreshCwIcon, ShoppingBagIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountPageShell, useAccountActivity } from "@/components/account-page-shell";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { OrderReceipt, TravelWatch } from "@/lib/contracts";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
}

function watchBudget(watch: TravelWatch) {
  return money(watch.criteria.max_total_budget.amount, watch.criteria.max_total_budget.currency);
}

function shortDate(value: string) {
  const date = value.length === 7 ? `${value}-01` : value;
  return new Intl.DateTimeFormat("en-US", { day: value.length === 7 ? undefined : "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}

function Card({ children }: { children: React.ReactNode }) {
  return <article className="rounded-xl border bg-card p-5 shadow-xs">{children}</article>;
}

function DashboardContent() {
  const { conversations, watchesByConversation } = useAccountActivity();
  const [receipts, setReceipts] = useState<OrderReceipt[]>([]);
  const [receiptsError, setReceiptsError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.listReceipts(controller.signal)
      .then(({ data }) => setReceipts(data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setReceiptsError(caught instanceof BoundApiError ? caught.message : "Receipts could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  const runningWatches = Object.values(watchesByConversation)
    .filter(({ status }) => ["ACTIVE", "CHECKING", "MATCHED", "EXECUTING"].includes(status))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  const confirmed = receipts.filter(({ status }) => status === "CONFIRMED");
  const totals = confirmed.reduce<Record<string, number>>((values, receipt) => ({ ...values, [receipt.total.currency]: (values[receipt.total.currency] ?? 0) + receipt.total.amount }), {});
  const totalLabel = Object.entries(totals).length === 0 ? "—" : Object.entries(totals).length === 1 ? money(Object.values(totals)[0]!, Object.keys(totals)[0]!) : `${Object.keys(totals).length} currencies`;

  return (
    <>
      <div className="border-b pb-8"><p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">JaguaryAI / Dashboard</p><h1 className="mt-3 text-4xl leading-none [font-family:var(--font-display)] md:text-5xl">Your agents are working for you.</h1><p className="mt-4 text-muted-foreground">Live account state loaded from Jaguary&apos;s conversations, watches, and receipt ledger.</p></div>

      {receiptsError ? <div className="mt-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><CircleAlertIcon className="size-5 shrink-0" />{receiptsError}</div> : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><ShoppingBagIcon className="size-5 text-[#3157fa]" /><p className="mt-3 text-sm">Confirmed purchases</p><strong className="mt-2 block text-3xl">{confirmed.length}</strong><small className="text-muted-foreground">Validated receipts</small></Card>
        <Card><ReceiptTextIcon className="size-5 text-[#3157fa]" /><p className="mt-3 text-sm">Total tracked</p><strong className="mt-2 block truncate text-2xl">{totalLabel}</strong><small className="text-muted-foreground">Confirmed receipts only</small></Card>
        <Card><RefreshCwIcon className={`size-5 ${runningWatches.length ? "text-amber-600 motion-safe:animate-spin" : "text-[#3157fa]"}`} /><p className="mt-3 text-sm">Active price watches</p><strong className="mt-2 block text-3xl">{runningWatches.length}</strong><small className="text-muted-foreground">Background searches</small></Card>
        <Card><SparklesIcon className="size-5 text-[#3157fa]" /><p className="mt-3 text-sm">Conversations</p><strong className="mt-2 block text-3xl">{conversations.length}</strong><small className="text-muted-foreground">Loaded from recent activity</small></Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><div className="flex items-center justify-between gap-4"><h2 className="text-2xl [font-family:var(--font-display)]">Automatic searches</h2><span className="text-xs text-muted-foreground">{runningWatches.length} running</span></div>{runningWatches.length ? <div className="mt-4 grid gap-3">{runningWatches.map((watch) => <Link className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/55 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center" href={`/demo?conversation=${encodeURIComponent(watch.conversation_id)}`} key={watch.watch_id}><span className="grid size-10 place-items-center rounded-lg bg-white text-amber-700"><RefreshCwIcon className="size-4 motion-safe:animate-spin" /></span><span><strong className="block text-sm">{watch.criteria.origin_iata} → {watch.criteria.destination_iata}</strong><small className="text-muted-foreground">{shortDate(watch.criteria.departure_date)} · {watch.status.toLowerCase()}</small></span><strong className="text-sm">Up to {watchBudget(watch)}</strong></Link>)}</div> : <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No automatic searches are running.</p>}</Card>
        <Card><div className="flex items-center justify-between gap-4"><h2 className="text-2xl [font-family:var(--font-display)]">Recent purchases</h2><Link className="text-sm text-[#3157fa]" href="/purchases">View all</Link></div>{receipts.slice(0, 3).length ? <div className="mt-4 grid gap-3">{receipts.slice(0, 3).map((receipt) => <div className="flex items-center justify-between gap-4 border-t pt-3 text-sm" key={receipt.receipt_id}><span><strong className="block">{receipt.fulfillment.origin} → {receipt.fulfillment.destination}</strong><small className="font-mono text-muted-foreground">{receipt.receipt_id}</small></span><strong>{money(receipt.total.amount, receipt.total.currency)}</strong></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No purchases have been recorded.</p>}</Card>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5 shadow-xs"><PlaneIcon className="size-6 text-[#3157fa]" /><h2 className="mt-3 text-2xl [font-family:var(--font-display)]">Start a conversation</h2><p className="mt-2 text-sm text-muted-foreground">Tell Jaguary what trip you&apos;re looking for.</p><Link className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#151c30] px-4 py-2 text-sm text-white" href="/demo"><SparklesIcon className="size-4" />Chat with Jaguary</Link></section>
    </>
  );
}

export function DashboardPage() {
  return <AccountPageShell activePage="dashboard"><DashboardContent /></AccountPageShell>;
}
