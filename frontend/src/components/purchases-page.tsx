"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  Clock3Icon,
  PlaneIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  SearchIcon,
  ShoppingBagIcon,
} from "lucide-react";

import { AccountPageShell } from "@/components/account-page-shell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { OrderReceipt } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type PurchaseFilter = "ALL" | OrderReceipt["status"];
type LoadState = "loading" | "ready" | "error";

const filters: Array<{ label: string; value: PurchaseFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Cancelled", value: "CANCELLED" },
];

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}

function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function merchantName(merchantId: string) {
  if (merchantId.toLowerCase().includes("vuelaya")) return "VuelaYa";
  return merchantId
    .replace(/^merchant[_-]?/i, "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ") || "Merchant";
}

function cabinName(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function Metric({ icon: Icon, label, value, detail }: {
  icon: typeof ReceiptTextIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border bg-card p-5 shadow-xs">
      <span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-[#3157fa]"><Icon className="size-4" /></span>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <strong className="mt-1 block truncate text-2xl [font-family:var(--font-display)]">{value}</strong>
      <small className="mt-1 block truncate text-muted-foreground">{detail}</small>
    </article>
  );
}

function PurchasesSkeleton() {
  return (
    <div aria-label="Loading purchases" className="grid gap-3">
      {[0, 1, 2].map((item) => (
        <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[44px_minmax(0,1fr)_auto]" key={item}>
          <span className="size-11 rounded-full bg-muted motion-safe:animate-pulse" />
          <span className="grid gap-2">
            <i className="h-4 w-48 rounded bg-muted motion-safe:animate-pulse" />
            <i className="h-3 w-72 max-w-full rounded bg-muted motion-safe:animate-pulse" />
          </span>
          <i className="h-6 w-24 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("break-all sm:text-right", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderReceipt["status"] }) {
  const confirmed = status === "CONFIRMED";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
      confirmed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600",
    )}>
      {confirmed ? <CircleCheckIcon className="size-3" /> : <Clock3Icon className="size-3" />}
      {confirmed ? "Confirmed" : "Cancelled"}
    </span>
  );
}

function ReceiptDetails({ receipt, onOpenChange }: {
  receipt: OrderReceipt | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={onOpenChange} open={receipt !== null}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {receipt ? (
          <>
            <SheetHeader className="border-b p-6 pr-14">
              <p className="text-[10px] font-semibold tracking-[.14em] text-[#3157fa] uppercase">Purchase receipt</p>
              <SheetTitle className="mt-2 text-3xl leading-tight [font-family:var(--font-display)]">
                {receipt.fulfillment.origin} → {receipt.fulfillment.destination}
              </SheetTitle>
              <SheetDescription>{merchantName(receipt.merchant_id)} · {formatDate(receipt.issued_at, true)}</SheetDescription>
            </SheetHeader>

            <div className="grid gap-6 p-6">
              <section className="rounded-xl border bg-muted/25 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total paid</p>
                    <strong className="mt-1 block text-3xl [font-family:var(--font-display)]">{formatMoney(receipt.total.amount, receipt.total.currency)}</strong>
                  </div>
                  <StatusBadge status={receipt.status} />
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold">Flight details</h3>
                <dl className="mt-3 divide-y rounded-xl border px-4 text-sm">
                  <Detail label="Route" value={`${receipt.fulfillment.origin} → ${receipt.fulfillment.destination}`} />
                  <Detail label="Departure" value={formatDate(receipt.fulfillment.departure_at, true)} />
                  <Detail label="Cabin" value={cabinName(receipt.fulfillment.cabin)} />
                  <Detail label="Travelers" value={String(receipt.items.reduce((total, item) => total + item.quantity, 0))} />
                </dl>
              </section>

              <section>
                <h3 className="text-sm font-semibold">Receipt trail</h3>
                <dl className="mt-3 divide-y rounded-xl border px-4 text-sm">
                  <Detail label="Receipt" value={receipt.receipt_id} mono />
                  <Detail label="Order" value={receipt.order_id} mono />
                  <Detail label="Payment" value={receipt.payment_id} mono />
                  <Detail label="Audit event" value={receipt.evidence.event_id} mono />
                  <Detail label="Correlation" value={receipt.evidence.correlation_id} mono />
                </dl>
              </section>

              <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
                This receipt comes directly from Jaguary&apos;s validated purchase ledger.
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PurchasesContent() {
  const [receipts, setReceipts] = useState<OrderReceipt[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [filter, setFilter] = useState<PurchaseFilter>("ALL");
  const [query, setQuery] = useState("");
  const [selectedReceipt, setSelectedReceipt] = useState<OrderReceipt | null>(null);

  const loadReceipts = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setErrorMessage(undefined);
    try {
      const result = await boundApi.listReceipts(signal);
      setReceipts(result.data);
      setLoadState("ready");
    } catch (caught) {
      if (signal?.aborted) return;
      setErrorMessage(caught instanceof BoundApiError ? caught.message : "Purchases could not be loaded right now.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.listReceipts(controller.signal).then((result) => {
      setReceipts(result.data);
      setLoadState("ready");
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setErrorMessage(caught instanceof BoundApiError ? caught.message : "Purchases could not be loaded right now.");
      setLoadState("error");
    });
    return () => controller.abort();
  }, []);

  const visibleReceipts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return receipts.filter((receipt) => {
      if (filter !== "ALL" && receipt.status !== filter) return false;
      if (!normalizedQuery) return true;
      return [
        receipt.fulfillment.origin,
        receipt.fulfillment.destination,
        receipt.merchant_id,
        receipt.receipt_id,
        ...receipt.items.map(({ name }) => name),
      ].some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [filter, query, receipts]);

  const confirmedReceipts = receipts.filter(({ status }) => status === "CONFIRMED");
  const totalsByCurrency = confirmedReceipts.reduce<Record<string, number>>((totals, receipt) => ({
    ...totals,
    [receipt.total.currency]: (totals[receipt.total.currency] ?? 0) + receipt.total.amount,
  }), {});
  const currencies = Object.entries(totalsByCurrency);
  const totalTracked = currencies.length === 0
    ? "—"
    : currencies.length === 1
      ? formatMoney(currencies[0]![1], currencies[0]![0])
      : `${currencies.length} currencies`;
  const latestReceipt = receipts[0];

  return (
    <>
      <div className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">Account / purchases</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl leading-none [font-family:var(--font-display)] md:text-5xl">Purchases</h1>
            <p className="mt-4 max-w-2xl text-muted-foreground">Real receipts for purchases completed by your agents.</p>
          </div>
          <Button disabled={loadState === "loading"} onClick={() => void loadReceipts()} variant="outline">
            <RefreshCwIcon className={cn(loadState === "loading" && "motion-safe:animate-spin")} />Refresh
          </Button>
        </div>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric icon={ReceiptTextIcon} label="Confirmed purchases" value={String(confirmedReceipts.length)} detail={`${receipts.length} total receipts`} />
        <Metric icon={ShoppingBagIcon} label="Total tracked" value={totalTracked} detail={currencies.length > 1 ? "Totals kept separate by currency" : "Confirmed receipts only"} />
        <Metric icon={Clock3Icon} label="Latest purchase" value={latestReceipt ? formatDate(latestReceipt.issued_at) : "—"} detail={latestReceipt ? `${latestReceipt.fulfillment.origin} → ${latestReceipt.fulfillment.destination}` : "No purchase recorded yet"} />
      </section>

      <section className="mt-7">
        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button className={cn("rounded-md border px-3 py-2 text-xs font-medium transition-colors", filter === item.value ? "border-[#151c30] bg-[#151c30] text-white" : "bg-card hover:bg-muted/50")} key={item.value} onClick={() => setFilter(item.value)} type="button">
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 sm:ml-auto sm:w-64">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search purchases</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" onChange={(event) => setQuery(event.target.value)} placeholder="Route, merchant, receipt…" value={query} />
          </label>
        </div>

        <div className="mt-5">
          {loadState === "loading" ? <PurchasesSkeleton /> : null}

          {loadState === "error" ? (
            <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-card p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-600"><CircleAlertIcon className="size-5" /></span>
                <h2 className="mt-4 text-xl [font-family:var(--font-display)]">Couldn&apos;t load purchases</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorMessage}</p>
                <Button className="mt-5" onClick={() => void loadReceipts()} variant="outline"><RefreshCwIcon />Try again</Button>
              </div>
            </div>
          ) : null}

          {loadState === "ready" && receipts.length === 0 ? (
            <div className="grid min-h-80 place-items-center rounded-xl border border-dashed bg-card p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-14 place-items-center rounded-full border bg-muted/30 text-[#3157fa]"><ReceiptTextIcon className="size-6" /></span>
                <h2 className="mt-5 text-2xl [font-family:var(--font-display)]">No purchases yet</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Once an agent completes a purchase, its validated receipt will appear here automatically.</p>
                <Button className="mt-5" render={<Link href="/demo" />}><PlaneIcon />Plan a trip</Button>
              </div>
            </div>
          ) : null}

          {loadState === "ready" && receipts.length > 0 && visibleReceipts.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-card p-10 text-center">
              <SearchIcon className="mx-auto size-6 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">No matching purchases</h2>
              <p className="mt-1 text-sm text-muted-foreground">Try another search or filter.</p>
            </div>
          ) : null}

          {loadState === "ready" && visibleReceipts.length > 0 ? (
            <div className="grid gap-3">
              {visibleReceipts.map((receipt) => (
                <article className="group grid gap-4 rounded-xl border bg-card p-5 shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center" key={receipt.receipt_id}>
                  <span className="grid size-11 place-items-center rounded-full border bg-blue-50/50 text-[#3157fa]"><PlaneIcon className="size-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-base">{receipt.fulfillment.origin} → {receipt.fulfillment.destination}</strong>
                      <StatusBadge status={receipt.status} />
                    </div>
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">{merchantName(receipt.merchant_id)} · {formatDate(receipt.issued_at)} · {cabinName(receipt.fulfillment.cabin)}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">Receipt {receipt.receipt_id}</p>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                    <strong className="text-lg">{formatMoney(receipt.total.amount, receipt.total.currency)}</strong>
                    <button className="block text-xs font-medium text-[#3157fa] hover:underline sm:mt-2 sm:ml-auto" onClick={() => setSelectedReceipt(receipt)} type="button">View receipt →</button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <ReceiptDetails onOpenChange={(open) => { if (!open) setSelectedReceipt(null); }} receipt={selectedReceipt} />
    </>
  );
}

export function PurchasesPage() {
  return <AccountPageShell activePage="purchases"><PurchasesContent /></AccountPageShell>;
}
