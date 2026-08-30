import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckIcon,
  Clock3Icon,
  PlaneTakeoffIcon,
  ShieldCheckIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: "VY 471 — VuelaYa",
  description: "Official demo listing for the VuelaYa GRU to COR flight selected by TravelBot.",
};

export default function VuelaYaFlightPage() {
  return (
    <main className="min-h-dvh bg-[#f8f6f1] text-[#182234]">
      <header className="border-b border-[#182234]/10 bg-white/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
          <Link className="flex items-center gap-2 text-sm font-medium hover:text-[#334de8]" href="/demo">
            <ArrowLeftIcon className="size-4" /> Back to approval
          </Link>
          <Link className="flex items-center gap-2 font-semibold tracking-tight" href="/connected-merchants/vuelaya">
            <span className="grid size-8 place-items-center rounded-full bg-[#334de8] text-white"><PlaneTakeoffIcon className="size-4" /></span>
            VuelaYa
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#334de8]/20 bg-[#334de8]/7 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-[#334de8] uppercase">
            <ShieldCheckIcon className="size-3" /> Official merchant listing
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-800"><CheckIcon className="size-3.5" /> Available</span>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <article className="overflow-hidden rounded-2xl border border-[#182234]/12 bg-white">
            <div className="border-b border-[#182234]/10 bg-[#182234] px-6 py-5 text-white">
              <p className="font-mono text-[10px] tracking-[0.14em] text-white/60 uppercase">VuelaYa flight VY 471</p>
              <div className="mt-5 flex items-center gap-4">
                <strong className="text-5xl font-medium tracking-tight">GRU</strong>
                <span className="h-px flex-1 bg-white/25" />
                <PlaneTakeoffIcon className="size-6 text-[#f7ca6b]" />
                <span className="h-px flex-1 bg-white/25" />
                <strong className="text-5xl font-medium tracking-tight">COR</strong>
              </div>
              <div className="mt-3 flex justify-between text-sm text-white/70"><span>São Paulo</span><span>Córdoba</span></div>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-2">
              <div>
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#667080] uppercase">Departure</p>
                <p className="mt-2 text-2xl font-medium">07:00</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-[#667080]"><CalendarDaysIcon className="size-4" /> Sep 15, 2026 · São Paulo</p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#667080] uppercase">Arrival</p>
                <p className="mt-2 text-2xl font-medium">10:05</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-[#667080]"><CalendarDaysIcon className="size-4" /> Sep 15, 2026 · Córdoba</p>
              </div>
              <div className="border-t border-[#182234]/10 pt-5">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#667080] uppercase">Duration</p>
                <p className="mt-2 flex items-center gap-2 text-sm"><Clock3Icon className="size-4 text-[#334de8]" /> 3h 05m · nonstop</p>
              </div>
              <div className="border-t border-[#182234]/10 pt-5">
                <p className="font-mono text-[10px] tracking-[0.12em] text-[#667080] uppercase">Fare</p>
                <p className="mt-2 text-sm">Economy · 1 passenger</p>
              </div>
            </div>
          </article>

          <aside className="h-fit rounded-2xl border border-[#182234]/12 bg-white p-6">
            <p className="font-mono text-[10px] tracking-[0.12em] text-[#667080] uppercase">Trip total</p>
            <strong className="mt-2 block text-4xl font-medium tracking-tight">US$137.00</strong>
            <p className="mt-2 text-xs leading-5 text-[#667080]">Final demo price for one passenger. The signed checkout preserves this exact amount and itinerary.</p>
            <dl className="mt-6 grid gap-3 border-t border-[#182234]/10 pt-5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-[#667080]">Offer ID</dt><dd className="font-mono text-xs">offer_vy_471</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[#667080]">Merchant</dt><dd className="font-mono text-xs">merchant_vuelaya</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-[#667080]">Protocol</dt><dd>UCP + AP2</dd></div>
            </dl>
            <Link className="mt-6 flex w-full items-center justify-center rounded-full bg-[#334de8] px-5 py-3 text-sm font-medium text-white hover:bg-[#263cc4]" href="/demo">
              Return to Jaguary to approve
            </Link>
            <p className="mt-3 text-center text-[10px] leading-4 text-[#667080]">Payment can only happen on Jaguary after explicit approval.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
