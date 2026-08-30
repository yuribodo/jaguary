"use client";

import Link from "next/link";
import {
  CheckCircle2Icon,
  ClipboardCheckIcon,
  CreditCardIcon,
  PlaneIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
  SparklesIcon,
} from "lucide-react";

import { AccountPageShell, useAccountActivity } from "@/components/account-page-shell";
import { demoPurchases, walletCards } from "@/lib/demo-data";
import type { TravelWatch } from "@/lib/contracts";

const brl = new Intl.NumberFormat("en-US", { style: "currency", currency: "BRL" });

function money(watch: TravelWatch) {
  const value = watch.criteria.max_total_budget;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: value.amount % 100 === 0 ? 0 : 2,
  }).format(value.amount / 100);
}

function shortDate(value: string) {
  const date = value.length === 7 ? `${value}-01` : value;
  return new Intl.DateTimeFormat("en-US", {
    day: value.length === 7 ? undefined : "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function nextCheck(value: string | null) {
  if (value === null) return "Checking now";
  return `Next check ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value))}`;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <article className={`rounded-xl border bg-card p-5 shadow-xs ${className}`}>{children}</article>;
}

function Offer({ title, price }: { title: string; price: string }) {
  return (
    <Link className="mt-3 grid grid-cols-[104px_1fr_auto] items-center gap-4 rounded-xl border p-3 hover:bg-muted/30" href="/opportunities">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="Flight opportunity" className="h-24 w-[104px] rounded-lg object-cover" src="/dashboard/flight-opportunity.jpg" />
      <span>
        <strong className="block">{title}</strong>
        <small className="text-muted-foreground">Economy estimate · VuelaYa</small>
        <em className="mt-2 block w-fit rounded bg-emerald-50 px-2 py-1 text-[10px] not-italic text-emerald-700">Excellent opportunity</em>
      </span>
      <strong className="text-emerald-700">{price}</strong>
    </Link>
  );
}

function AutomaticSearches({ watches }: { watches: TravelWatch[] }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.12em] text-amber-700 uppercase">Live activity</p>
          <h2 className="mt-1 text-2xl [font-family:var(--font-display)]">Automatic searches</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
          <i className="size-1.5 rounded-full bg-amber-500 motion-safe:animate-pulse" />{watches.length} running
        </span>
      </div>

      {watches.length ? (
        <div className="mt-4 grid gap-2.5">
          {watches.map((watch) => (
            <Link
              className="group grid gap-3 rounded-xl border border-amber-200 bg-amber-50/55 p-4 transition-colors hover:bg-amber-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
              href={`/demo?conversation=${encodeURIComponent(watch.conversation_id)}`}
              key={watch.watch_id}
            >
              <span className="grid size-10 place-items-center rounded-lg border border-amber-200 bg-white text-amber-700">
                <RefreshCwIcon className="size-4 motion-safe:animate-spin" />
              </span>
              <span className="min-w-0">
                <strong className="block text-sm text-slate-950">{watch.criteria.origin_iata} → {watch.criteria.destination_iata}</strong>
                <span className="mt-1 block truncate text-[11px] text-slate-600">{shortDate(watch.criteria.departure_date)} · {watch.criteria.passenger_count === 1 ? "1 traveler" : `${watch.criteria.passenger_count} travelers`} · {nextCheck(watch.next_check_at)}</span>
              </span>
              <span className="sm:text-right">
                <strong className="block text-sm text-slate-950">Up to {money(watch)}</strong>
                <span className="mt-1 block text-[10px] font-semibold text-amber-700">Searching fares →</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed p-4">
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><PlaneIcon className="size-4" /></span>
          <span><strong className="block text-sm">No automatic searches running</strong><small className="mt-0.5 block text-muted-foreground">When an agent starts watching a price, it will appear here.</small></span>
        </div>
      )}
    </Card>
  );
}

function DashboardOverview({ watchesByConversation }: { watchesByConversation: Record<string, TravelWatch> }) {
  const runningWatches = Object.values(watchesByConversation)
    .filter(({ status }) => ["ACTIVE", "CHECKING", "MATCHED", "EXECUTING"].includes(status))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  const spent = demoPurchases.reduce((total, purchase) => total + purchase.amount, 0);
  const limit = walletCards.reduce((total, card) => total + card.limit, 0);
  const used = walletCards.reduce((total, card) => total + card.used, 0);

  return (
    <>
      <div className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">JaguaryAI / Dashboard</p>
        <h1 className="mt-3 text-4xl leading-none [font-family:var(--font-display)] md:text-5xl">Your agents are working for you.</h1>
        <p className="mt-4 text-muted-foreground">See what is running now, what needs your approval, and what Jaguary has completed.</p>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><p className="text-sm">Money saved</p><strong className="mt-3 block text-2xl text-emerald-700">R$2,840.00</strong><small className="text-muted-foreground">by Jaguary agents</small><svg className="mt-2 h-9 w-full" viewBox="0 0 150 40"><path d="M2 36 C22 36 22 25 40 27 S61 18 75 22 S93 14 108 15 S123 4 148 2" fill="none" stroke="#69b77d" strokeWidth="1.7" /><circle cx="148" cy="2" fill="#69b77d" r="2.5" /></svg><span className="rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">↑ 18% vs last month</span></Card>
        <Card><ShoppingBagIcon className="size-5 text-[#3157fa]" /><p className="mt-3 text-sm">Completed purchases</p><strong className="mt-2 block text-3xl">{demoPurchases.length}</strong><small className="text-muted-foreground">{brl.format(spent)} in history</small></Card>
        <Card className={runningWatches.length ? "border-amber-200 bg-amber-50/40" : ""}><RefreshCwIcon className={`size-5 ${runningWatches.length ? "text-amber-600 motion-safe:animate-spin" : "text-[#3157fa]"}`} /><p className="mt-3 text-sm">Active price watches</p><strong className="mt-2 block text-3xl">{runningWatches.length}</strong><small className="text-muted-foreground">Checking fares in the background</small></Card>
        <Card><ClipboardCheckIcon className="size-5 text-[#3157fa]" /><p className="mt-3 text-sm">Auditable decisions</p><strong className="mt-2 block text-3xl">100%</strong><small className="text-muted-foreground">All decisions reviewed</small></Card>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_.95fr]">
        <AutomaticSearches watches={runningWatches} />
        <Card><div className="flex justify-between"><h2 className="text-2xl [font-family:var(--font-display)]">Opportunities</h2><Link className="text-sm text-[#3157fa]" href="/opportunities">View all opportunities</Link></div><Offer title="São Paulo → Córdoba" price="R$742.00" /><Offer title="Mexico City → Bogotá" price="R$2,300.00" /></Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card><h2 className="text-xl [font-family:var(--font-display)]">Approval Center</h2><p className="mt-4 text-sm">Flight requires your approval</p><strong className="mt-2 block text-2xl">R$879.00</strong><Link className="mt-5 inline-flex rounded-md bg-[#151c30] px-4 py-2 text-sm text-white" href="/approval-center">Review approval</Link></Card>
        <Card><h2 className="text-xl [font-family:var(--font-display)]">Wallet</h2><strong className="mt-4 block text-2xl">{brl.format(limit - used)}</strong><p className="text-sm text-muted-foreground">of {brl.format(limit)} available</p><Link className="mt-5 inline-flex items-center gap-2 text-sm text-[#3157fa]" href="/payment-methods"><CreditCardIcon className="size-4" />Manage payment methods</Link></Card>
        <Card><h2 className="text-xl [font-family:var(--font-display)]">Start a conversation</h2><p className="mt-3 text-sm text-muted-foreground">Tell Jaguary what you’re looking for.</p><Link className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#151c30] px-4 py-2 text-sm text-white" href="/demo"><SparklesIcon className="size-4" />Chat with Jaguary</Link></Card>
      </section>

      <Link className="mt-6 flex items-center gap-3 rounded-xl border bg-card p-5 shadow-xs" href="/trilha-de-auditoria"><CheckCircle2Icon className="size-7 text-[#3157fa]" /><span><strong className="block">Your protection is our priority</strong><small className="text-muted-foreground">Approval, limits, payment protection, and auditability.</small></span></Link>
    </>
  );
}

function DashboardContent() {
  const { watchesByConversation } = useAccountActivity();
  return <DashboardOverview watchesByConversation={watchesByConversation} />;
}

export function DashboardPage() {
  return <AccountPageShell activePage="dashboard"><DashboardContent /></AccountPageShell>;
}
