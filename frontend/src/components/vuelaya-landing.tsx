"use client";

import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, CircleAlertIcon, PlaneTakeoffIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { MerchantCapabilities, OfferCandidate } from "@/lib/contracts";

function money(offer: OfferCandidate) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: offer.total.currency }).format(offer.total.amount / 100);
}

function departure(offer: OfferCandidate) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(offer.fulfillment.departure_at));
}

export function VuelaYaLanding() {
  const [merchant, setMerchant] = useState<MerchantCapabilities>();
  const [offers, setOffers] = useState<OfferCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(undefined);
    try {
      const [profile, catalog] = await Promise.all([boundApi.getMerchantProfile(signal), boundApi.listOffers(signal)]);
      setMerchant(profile.data);
      setOffers(catalog.data);
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof BoundApiError ? caught.message : "VuelaYa could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      boundApi.getMerchantProfile(controller.signal),
      boundApi.listOffers(controller.signal),
    ]).then(([profile, catalog]) => {
      setMerchant(profile.data);
      setOffers(catalog.data);
      setLoading(false);
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setError(caught instanceof BoundApiError ? caught.message : "VuelaYa could not be loaded.");
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-dvh bg-[#f8f6f1] text-[#182234]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8"><Link className="flex items-center gap-2 text-sm font-medium hover:text-[#334de8]" href="/connected-merchants"><ArrowLeftIcon className="size-4" />Merchants</Link><div className="flex items-center gap-2 font-semibold"><span className="grid size-8 place-items-center rounded-full bg-[#334de8] text-white"><PlaneTakeoffIcon className="size-4" /></span>{merchant?.merchant_name ?? "VuelaYa"}</div><Link className="rounded-full border border-[#182234]/15 px-4 py-2 text-sm font-medium hover:bg-white" href="/demo">New conversation</Link></header>
      <section className="bg-[#334de8] px-5 py-16 text-white md:py-22"><div className="mx-auto max-w-6xl"><p className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[.14em] text-white/70 uppercase"><ShieldCheckIcon className="size-3" /> API-published merchant</p><h1 className="mt-4 text-5xl leading-none md:text-7xl">Observed flight offers.</h1><p className="mt-5 max-w-xl text-lg text-white/80">This page only shows offers currently returned by the Jaguary merchant API.</p></div></section>
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
        <div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[.12em] text-[#566070] uppercase">Live catalog state</p><h2 className="mt-1 text-3xl [font-family:var(--font-display)]">Available flights</h2></div><button className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm disabled:opacity-50" disabled={loading} onClick={() => void load()} type="button"><RefreshCwIcon className={`size-4 ${loading ? "motion-safe:animate-spin" : ""}`} />Refresh</button></div>
        {loading ? <div className="mt-5 h-48 rounded-xl border bg-white motion-safe:animate-pulse" /> : null}
        {error ? <div className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><CircleAlertIcon className="size-5 shrink-0" />{error}</div> : null}
        {!loading && !error && offers.length === 0 ? <div className="mt-5 rounded-xl border border-dashed bg-white p-10 text-center"><p className="font-medium">No offers are currently retained.</p><p className="mt-2 text-sm text-[#566070]">Ask Jaguary to search for a flight. Provider results are stored in the catalog for a limited time.</p><Link className="mt-5 inline-flex rounded-md bg-[#182234] px-4 py-2 text-sm text-white" href="/demo">Search with Jaguary</Link></div> : null}
        <div className="mt-5 grid gap-4">{offers.map((offer) => <article className="grid gap-4 rounded-xl border bg-white p-5 shadow-xs md:grid-cols-[1.3fr_1fr_auto] md:items-center" key={offer.offer_id}><div><p className="font-mono text-[10px] tracking-[.12em] text-[#566070]">{offer.offer_id}</p><h3 className="mt-2 text-2xl [font-family:var(--font-display)]">{offer.fulfillment.origin} <span className="text-[#334de8]">→</span> {offer.fulfillment.destination}</h3><p className="mt-2 flex items-center gap-2 text-sm text-[#566070]"><CalendarIcon className="size-4" />{departure(offer)} · {offer.fulfillment.cabin.toLowerCase().replaceAll("_", " ")}</p></div><strong className="text-2xl">{money(offer)}</strong><Link className="inline-flex h-10 items-center justify-center rounded-lg bg-[#334de8] px-4 text-sm font-medium text-white hover:bg-[#263cc4]" href={`/lojas-conectadas/vuelaya/voos/${encodeURIComponent(offer.offer_id)}`}>Review offer</Link></article>)}</div>
      </section>
    </main>
  );
}
