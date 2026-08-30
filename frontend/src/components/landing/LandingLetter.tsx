"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LandingAsciiField } from "@/components/landing/LandingAsciiField";
import { useReducedMotion } from "@/components/landing/use-reduced-motion";
import { cn } from "@/lib/utils";

const SPEECH = [
  "I need Córdoba this week.",
  "Economy. Not above one fifty.",
  "TravelBot books it after I sign.",
] as const;

export function LandingLetter() {
  const isReduced = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const [scene, setScene] = useState(5);

  useEffect(() => {
    if (isReduced) return;

    const root = rootRef.current;
    if (!root) return;

    let timers: number[] = [];
    const play = () => {
      timers = [140, 320, 500, 780, 1120].map((ms, index) =>
        window.setTimeout(() => setScene(index + 1), ms)
      );
    };

    const rect = root.getBoundingClientRect();
    const isInView = rect.top < window.innerHeight * 0.72 && rect.bottom > 0;
    if (isInView) return;

    setScene(0);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.28 }
    );

    observer.observe(root);
    return () => {
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [isReduced]);

  return (
    <section
      className="relative flex min-h-svh overflow-hidden bg-[#171a17] text-[#eee9dc]"
      id="enter"
      ref={rootRef}
    >
      <LandingAsciiField tone="ink" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_24%,rgb(23_26_23_/_72%)_0%,rgb(23_26_23_/_28%)_46%,transparent_72%)]" />

      <div className="relative z-10 flex min-h-svh w-full flex-col justify-between px-6 py-16 md:px-10 md:py-20">
        <div>
          <p className="mb-8 text-sm text-[#eee9dc]/40">The surface</p>
          <ol className="space-y-3">
            {SPEECH.map((line, index) => (
              <li
                className={cn(
                  "landing-speech max-w-[22ch] text-[1.2rem] leading-[1.4] tracking-[-0.02em] text-[#eee9dc]/80 md:text-[1.35rem]",
                  scene > index ? "is-on" : "is-off"
                )}
                key={line}
              >
                {line}
              </li>
            ))}
          </ol>
        </div>

        <h2
          className={cn(
            "landing-letter-name [font-family:var(--font-display)] md:absolute md:top-[38%] md:right-10 md:left-auto",
            scene >= 4 ? "is-on" : "is-off"
          )}
        >
          TravelBot
        </h2>

        <div
          className={cn(
            "landing-instrument max-w-[22rem]",
            scene >= 4 ? "is-on" : "is-off"
          )}
        >
          <p className="mb-4 font-mono text-[0.68rem] tracking-[0.18em] text-[#eee9dc]/40 uppercase">
            Marta authorizes
          </p>
          <p className="text-[1.05rem] leading-[1.5] text-[#eee9dc]/70">
            GRU → COR · economy · ≤ US$ 150 · once
          </p>
          <div
            className={cn(
              "landing-speech mt-8 flex flex-col items-start gap-3",
              scene >= 5 ? "is-on" : "is-off"
            )}
          >
            <Link
              className="inline-flex min-h-11 items-center bg-[#eee9dc] px-5 text-sm text-[#171a17] transition-[transform,background-color,color] duration-[160ms] ease-[var(--ease-out)] hover:bg-[#315bea] hover:text-white focus-visible:bg-[#315bea] focus-visible:text-white active:scale-[0.97]"
              href="/demo"
            >
              Enter the surface
            </Link>
            <p className="text-sm text-[#eee9dc]/38">Revoke anytime. Payment never starts.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
