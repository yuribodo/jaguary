"use client";

import { useEffect, useState } from "react";

import { useReducedMotion } from "@/components/landing/use-reduced-motion";
import { RAIL_STATIONS } from "@/lib/landing";
import { cn } from "@/lib/utils";

const STATUSES = [
  "Marta describes GRU → COR and a US$150 ceiling.",
  "The mandate is visible: merchant, amount, validity.",
  "TravelBot only acts inside the active letter.",
  "VuelaYa publishes checkout. Jaguary does not invent the price.",
  "Payment waits for ALLOW. Revoke cuts the rail.",
] as const;

export function LandingStage() {
  const isReduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const visibleStep = isReduced ? RAIL_STATIONS.length - 1 : step;

  useEffect(() => {
    if (isReduced) return;

    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % RAIL_STATIONS.length);
    }, 1600);

    return () => window.clearInterval(timer);
  }, [isReduced]);

  const progress = visibleStep / (RAIL_STATIONS.length - 1);

  return (
    <div className="w-full">
      <p
        aria-live="polite"
        className="mb-8 min-h-[1.5rem] text-center text-sm text-[var(--muted-ink)]"
      >
        {STATUSES[visibleStep]}
      </p>

      <ol
        aria-label="Authority rail"
        className="relative mx-auto grid max-w-3xl grid-cols-5"
      >
        <span
          aria-hidden
          className="absolute top-[6px] right-[10%] left-[10%] h-px bg-[var(--line)] sm:top-[9px]"
        />
        <span
          aria-hidden
          className="landing-stage-fill absolute top-[6px] left-[10%] h-px bg-[var(--cobalt)] sm:top-[9px]"
          style={{
            width: "80%",
            transform: `scaleX(${progress})`,
          }}
        />

        {RAIL_STATIONS.map((station, index) => {
          const isActive = index === visibleStep;
          const isDone = index < visibleStep;
          const isPending = station.pending && index === visibleStep;

          return (
            <li className="relative flex flex-col items-center gap-2 sm:gap-3" key={station.id}>
              <span
                className={cn(
                  "landing-stage-node relative z-10 size-3.5 rounded-full border-2 bg-[var(--canvas)] sm:size-[19px]",
                  isDone && !isActive && "border-[var(--graphite)] bg-[var(--graphite)]",
                  isActive &&
                    !isPending &&
                    "border-[var(--cobalt)] bg-[var(--cobalt)] shadow-[0_0_0_6px_rgb(49_91_234_/_12%)]",
                  isPending &&
                    "border-dashed border-[var(--alert)] bg-[var(--canvas)] shadow-[0_0_0_6px_rgb(228_93_70_/_12%)]"
                )}
              />
              <span
                className={cn(
                  "hidden text-center text-[0.78rem] tracking-[-0.02em] text-[var(--muted-ink)] transition-colors duration-300 sm:block",
                  isActive && "text-[var(--graphite)]"
                )}
              >
                {station.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
