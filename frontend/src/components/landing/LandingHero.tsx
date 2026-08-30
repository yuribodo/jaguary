import Link from "next/link";

import { LandingAsciiField } from "@/components/landing/LandingAsciiField";
import { LandingStage } from "@/components/landing/LandingStage";

const HEADLINE = ["Nothing", "moves", "off", "the", "rail."];

export function LandingHero() {
  return (
    <section className="relative flex min-h-svh flex-col overflow-hidden">
      <LandingAsciiField />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(243_242_236_/_70%)_0%,rgb(243_242_236_/_36%)_52%,transparent_78%)]" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <p className="text-[0.95rem] tracking-[-0.03em]">Jaguary</p>
        <Link
          className="min-h-10 px-1 text-sm tracking-[-0.01em] transition-transform duration-[160ms] ease-[var(--ease-out)] hover:opacity-70 focus-visible:text-[var(--cobalt)] active:scale-[0.97]"
          data-landing-link
          href="/demo"
        >
          Open demo
        </Link>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 md:px-10">
        <p
          className="landing-rise mb-6 text-sm text-[var(--muted-ink)]"
          style={{ animationDelay: "40ms" }}
        >
          Authority by Jaguary
        </p>

        <h1 className="max-w-[14ch] text-center text-[clamp(2.6rem,7vw,5.2rem)] leading-[0.94] font-semibold tracking-[-0.055em] [font-family:var(--font-display)]">
          {HEADLINE.map((word, index) => (
            <span
              className="landing-rise mr-[0.28em] inline-block last:mr-0"
              key={word}
              style={{ animationDelay: `${120 + index * 48}ms` }}
            >
              {word}
            </span>
          ))}
        </h1>

        <p
          className="landing-rise mt-7 max-w-[40ch] text-center text-[1.05rem] leading-[1.6] text-[var(--muted-ink)]"
          style={{ animationDelay: "460ms" }}
        >
          Jaguary decides whether an agent may perform an economic action —
          identity, mandate, scope, and replay — before any payment.
        </p>

        <div
          className="landing-rise mt-9 flex items-center gap-5"
          style={{ animationDelay: "560ms" }}
        >
          <Link
            className="inline-flex min-h-11 items-center rounded-md bg-[var(--graphite)] px-5 text-sm text-[var(--canvas)] transition-[transform,background-color] duration-[160ms] ease-[var(--ease-out)] hover:bg-[var(--cobalt)] focus-visible:bg-[var(--cobalt)] active:scale-[0.97]"
            href="/demo"
          >
            Authorize TravelBot
          </Link>
          <a
            className="text-sm text-[var(--muted-ink)] transition-colors duration-150 hover:text-[var(--graphite)]"
            data-landing-link
            href="#how"
          >
            How it works
          </a>
        </div>

        <div className="landing-rise mt-20 w-full max-w-3xl" style={{ animationDelay: "700ms" }}>
          <LandingStage />
        </div>
      </div>
    </section>
  );
}
