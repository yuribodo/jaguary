"use client";

import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, CheckCircle2Icon, CircleAlertIcon, PlaneTakeoffIcon, ShieldCheckIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { OfferCandidate } from "@/lib/contracts";

function money(offer: OfferCandidate) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: offer.total.currency }).format(offer.total.amount / 100);
}

export default function FlightPage() {
  const { id } = useParams<{ id: string }>();
  const [offer, setOffer] = useState<OfferCandidate>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.listOffers(controller.signal).then(({ data }) => {
      const selected = data.find(({ offer_id }) => offer_id === id);
      if (selected) setOffer(selected);
      else setError("This offer is no longer available in the merchant catalog.");
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof BoundApiError ? caught.message : "The offer could not be loaded.");
    });
    return () => controller.abort();
  }, [id]);

  if (error) return <main className="grid min-h-dvh place-items-center bg-[#f8f6f1] p-6 text-center"><div><CircleAlertIcon className="mx-auto size-7 text-red-600" /><h1 className="mt-4 text-3xl [font-family:var(--font-display)]">Offer unavailable</h1><p className="mt-2 text-sm text-[#566070]">{error}</p><Link className="mt-5 inline-flex text-[#334de8] underline" href="/lojas-conectadas/vuelaya">Back to offers</Link></div></main>;
  if (!offer) return <main className="grid min-h-dvh place-items-center bg-[#f8f6f1]"><p className="text-sm text-[#566070]">Loading offer…</p></main>;

  const departure = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(offer.fulfillment.departure_at));
  const duration = offer.fulfillment.duration_minutes === undefined ? "Not supplied" : `${Math.floor(offer.fulfillment.duration_minutes / 60)}h ${String(offer.fulfillment.duration_minutes % 60).padStart(2, "0")}m`;
  const stops = offer.fulfillment.stops === undefined ? "Not supplied" : offer.fulfillment.stops === 0 ? "Nonstop" : `${offer.fulfillment.stops} stop${offer.fulfillment.stops === 1 ? "" : "s"}`;

  return <main className="min-h-dvh bg-[#f8f6f1] px-5 py-7 text-[#182234] md:px-8"><div className="mx-auto max-w-3xl"><Link className="inline-flex items-center gap-2 text-sm font-medium hover:text-[#334de8]" href="/lojas-conectadas/vuelaya"><ArrowLeftIcon className="size-4" />Back to offers</Link><p className="mt-10 font-mono text-[10px] tracking-[.14em] text-[#566070] uppercase">VuelaYa · API offer review</p><h1 className="mt-3 text-5xl leading-none [font-family:var(--font-display)]">Your journey starts here.</h1><article className="mt-8 rounded-2xl border bg-white p-6 shadow-lg"><div className="flex items-start justify-between gap-4"><div><p className="text-sm text-[#566070]">Selected route</p><h2 className="mt-2 text-3xl [font-family:var(--font-display)]">{offer.fulfillment.origin} <span className="text-[#334de8]">→</span> {offer.fulfillment.destination}</h2></div><span className="grid size-11 place-items-center rounded-full bg-[#334de8] text-white"><PlaneTakeoffIcon className="size-5" /></span></div><dl className="mt-7 grid gap-4 border-y py-5 text-sm sm:grid-cols-3"><div><dt className="text-[#566070]">Departure</dt><dd className="mt-1 font-medium"><CalendarIcon className="mr-1 inline size-4" />{departure}</dd></div><div><dt className="text-[#566070]">Duration</dt><dd className="mt-1 font-medium">{duration}</dd></div><div><dt className="text-[#566070]">Itinerary</dt><dd className="mt-1 font-medium">{stops}</dd></div></dl><div className="mt-6 flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-[#566070]">Offer total</p><strong className="text-3xl">{money(offer)}</strong></div><Link className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#334de8] px-5 text-sm font-medium text-white hover:bg-[#263cc4]" href={`/demo?offer=${encodeURIComponent(offer.offer_id)}`}><CheckCircle2Icon className="size-4" />Continue with Jaguary</Link></div></article><p className="mt-5 flex items-center gap-2 text-xs leading-5 text-[#566070]"><ShieldCheckIcon className="size-4 text-[#334de8]" />These details came from the merchant API. A purchase still requires the normal Jaguary authorization flow.</p></div></main>;
}
