import Link from "next/link";

import { LandingAsciiField } from "@/components/landing/LandingAsciiField";
import { LandingReveal } from "@/components/landing/LandingReveal";

const REQUEST_STEPS = [
  {
    index: "01",
    title: "Marta asks",
    copy: "A flight to Córdoba, economy, no more than US$150.",
  },
  {
    index: "02",
    title: "TravelBot proposes",
    copy: "The agent searches and selects — it does not authorize.",
  },
  {
    index: "03",
    title: "VuelaYa fixes the terms",
    copy: "The merchant signs the exact offer, price, and expiry.",
  },
] as const;

const AUTHORITY_TERMS = [
  ["Who", "TravelBot"],
  ["What", "GRU → COR"],
  ["Limit", "≤ US$150"],
  ["Use", "Once"],
] as const;

export function LandingLetter() {
  return (
    <section
      className="relative flex min-h-svh overflow-hidden bg-[#171a17] text-[#eee9dc]"
      id="enter"
    >
      <LandingAsciiField className="opacity-[0.3] md:opacity-[0.46]" tone="ink" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_14%_18%,rgb(23_26_23_/_62%)_0%,rgb(23_26_23_/_24%)_46%,transparent_70%)]" />

      <div className="relative z-10 mx-auto flex min-h-svh w-full max-w-[100rem] flex-col px-6 py-14 md:px-10 md:py-16 lg:px-14">
        <LandingReveal className="flex items-start justify-between gap-6 border-b border-[#eee9dc]/14 pb-5">
          <p className="shrink-0 whitespace-nowrap font-mono text-[0.65rem] tracking-[0.18em] text-[#eee9dc]/72 uppercase">
            Bound by Jaguary
          </p>
          <p className="max-w-[11rem] text-right text-xs text-[#eee9dc]/52">
            The enforcement layer before payment
          </p>
        </LandingReveal>

        <div className="grid flex-1 items-center gap-14 py-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20 lg:py-16">
          <div>
            <LandingReveal>
              <h2 className="max-w-[15ch] text-[clamp(2.6rem,5vw,5rem)] leading-[0.92] font-semibold tracking-[-0.06em] [font-family:var(--font-display)]">
                <span className="block">One request.</span>
                <span className="block whitespace-nowrap">One enforceable</span>
                <span className="block">path.</span>
              </h2>
              <p className="mt-6 max-w-[41rem] text-[1rem] leading-[1.65] text-[#eee9dc]/58 md:text-[1.08rem]">
                The model can understand intent. It cannot become the final authority over money.
                Jaguary keeps proposal, commercial truth, deterministic verification, and payment
                on separate rails.
              </p>
            </LandingReveal>

            <ol className="mt-10 grid gap-7 border-t border-[#eee9dc]/14 pt-7 sm:grid-cols-3 sm:gap-5">
              {REQUEST_STEPS.map((step, index) => (
                <li key={step.index}>
                  <LandingReveal delayMs={120 + index * 90}>
                    <p className="font-mono text-[0.62rem] tracking-[0.16em] text-[#eee9dc]/50 uppercase">
                      {step.index}
                    </p>
                    <h3 className="mt-3 text-[1rem] tracking-[-0.025em] text-[#eee9dc]/92">
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-[17rem] text-sm leading-[1.55] text-[#eee9dc]/58">
                      {step.copy}
                    </p>
                  </LandingReveal>
                </li>
              ))}
            </ol>
          </div>

          <LandingReveal
            className="border-y border-[#eee9dc]/18 py-6 lg:border-y-0 lg:border-l lg:py-2 lg:pl-10"
            delayMs={180}
          >
            <div className="flex items-baseline justify-between gap-5 border-b border-[#eee9dc]/14 pb-5">
              <p className="font-mono text-[0.64rem] tracking-[0.17em] text-[#eee9dc]/56 uppercase">
                Authority instrument
              </p>
              <p className="font-mono text-[0.6rem] tracking-[0.12em] text-[#65d6a3] uppercase">
                Revocable
              </p>
            </div>

            <dl className="py-3">
              {AUTHORITY_TERMS.map(([label, value]) => (
                <div
                  className="grid grid-cols-[5.5rem_1fr] items-baseline border-b border-[#eee9dc]/10 py-3.5"
                  key={label}
                >
                  <dt className="font-mono text-[0.62rem] tracking-[0.14em] text-[#eee9dc]/52 uppercase">
                    {label}
                  </dt>
                  <dd className="text-[0.95rem] text-[#eee9dc]/84">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-3 grid gap-5 border-l-2 border-[#315bea] pl-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="font-mono text-[0.64rem] tracking-[0.16em] text-[#6684ff] uppercase">
                  Bound Verify
                </p>
                <p className="mt-2 max-w-[28rem] text-[1.45rem] leading-[1.14] font-semibold tracking-[-0.04em] [font-family:var(--font-display)] md:text-[1.8rem]">
                  Payment waits for ALLOW.
                </p>
              </div>
              <p className="font-mono text-[0.58rem] leading-[1.6] tracking-[0.11em] text-[#eee9dc]/52 uppercase sm:text-right">
                Identity · scope
                <br />
                nonce · replay
              </p>
            </div>

            <div className="mt-7 flex items-start gap-3 border-t border-dashed border-[#e45d46]/48 pt-4 text-[#f17a64]">
              <span aria-hidden className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-current" />
              <p className="text-xs leading-[1.55]">
                Revoke or mismatch interrupts the rail before a payment credential is resolved.
              </p>
            </div>
          </LandingReveal>
        </div>

        <LandingReveal
          className="flex flex-col items-start justify-between gap-5 border-t border-[#eee9dc]/14 pt-6 sm:flex-row sm:items-center"
          delayMs={260}
        >
          <Link
            className="inline-flex min-h-12 items-center gap-8 bg-[#315bea] px-6 text-sm font-medium text-white transition-[transform,background-color] duration-[160ms] ease-[var(--ease-out)] hover:bg-[#4269f4] focus-visible:bg-[#4269f4] active:scale-[0.98]"
            href="/demo"
          >
            Run the demo
            <span aria-hidden>→</span>
          </Link>
          <p className="max-w-[25rem] text-sm leading-[1.55] text-[#eee9dc]/58 sm:text-right">
            Follow the evidence behind identity, mandate, checkout, decision, payment, and receipt.
          </p>
        </LandingReveal>
      </div>
    </section>
  );
}
