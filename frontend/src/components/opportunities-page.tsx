"use client";

import Link from "next/link";
import { CircleAlertIcon, PlaneIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AccountPageShell } from "@/components/account-page-shell";
import { Button } from "@/components/ui/button";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { OfferCandidate } from "@/lib/contracts";

function money(offer: OfferCandidate) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: offer.total.currency }).format(offer.total.amount / 100);
}

export function OpportunitiesPage() {
  const [offers, setOffers] = useState<OfferCandidate[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(undefined);
    try {
      setOffers((await boundApi.listOffers(signal)).data);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof BoundApiError ? caught.message : "Offers could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.listOffers(controller.signal).then(({ data }) => {
      setOffers(data);
      setLoading(false);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setError(caught instanceof BoundApiError ? caught.message : "Offers could not be loaded.");
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const visible = useMemo(() => offers.filter((offer) => `${offer.fulfillment.origin} ${offer.fulfillment.destination} ${offer.items.map(({ name }) => name).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [offers, query]);

  return (
    <AccountPageShell activePage="opportunities">
      <div className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">JaguaryAI / observed offers</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-5xl [font-family:var(--font-display)]">Opportunities</h1><p className="mt-4 text-muted-foreground">Offers currently retained by the merchant catalog.</p></div><Button disabled={loading} onClick={() => void load()} variant="outline"><RefreshCwIcon className={loading ? "motion-safe:animate-spin" : ""} />Refresh</Button></div>
      </div>
      <label className="mt-7 flex h-10 items-center gap-2 rounded-md border bg-card px-3 sm:w-72"><SearchIcon className="size-4 text-muted-foreground" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Search route or flight" value={query} /></label>
      {loading ? <div className="mt-5 h-48 rounded-xl border bg-card motion-safe:animate-pulse" /> : null}
      {error ? <div className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><CircleAlertIcon className="size-5 shrink-0" />{error}</div> : null}
      {!loading && !error && visible.length === 0 ? <div className="mt-5 rounded-xl border border-dashed p-10 text-center"><PlaneIcon className="mx-auto size-6 text-muted-foreground" /><h2 className="mt-3 font-semibold">No observed offers</h2><p className="mt-1 text-sm text-muted-foreground">Run a flight search in a Jaguary conversation; live results will appear here while they remain in the catalog.</p><Link className="mt-5 inline-flex rounded-md bg-[#151c30] px-4 py-2 text-sm text-white" href="/demo">Start a search</Link></div> : null}
      <div className="mt-5 grid gap-4">{visible.map((offer) => <article className="grid gap-4 rounded-xl border bg-card p-5 shadow-xs md:grid-cols-[auto_1fr_auto] md:items-center" key={offer.offer_id}><span className="grid size-11 place-items-center rounded-full bg-blue-50 text-[#3157fa]"><PlaneIcon className="size-5" /></span><div><h2 className="text-xl [font-family:var(--font-display)]">{offer.fulfillment.origin} → {offer.fulfillment.destination}</h2><p className="mt-1 text-sm text-muted-foreground">{offer.items.map(({ name }) => name).join(" · ")} · {offer.fulfillment.cabin.toLowerCase().replaceAll("_", " ")}</p><p className="mt-2 font-mono text-[10px] text-muted-foreground">{offer.offer_id} · observed {new Date(offer.observed_at).toLocaleString("en-US")}</p></div><div className="md:text-right"><strong className="text-xl text-emerald-700">{money(offer)}</strong><Link className="mt-3 block text-sm text-[#3157fa]" href={`/lojas-conectadas/vuelaya/voos/${encodeURIComponent(offer.offer_id)}`}>Review offer →</Link></div></article>)}</div>
    </AccountPageShell>
  );
}
