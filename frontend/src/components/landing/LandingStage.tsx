"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/components/landing/use-reduced-motion";
import { RAIL_STATIONS } from "@/lib/landing";
import { cn } from "@/lib/utils";

const VERIFY_CHECKS = [
  ["Identity", "Who is asking"],
  ["Scope", "What is allowed"],
  ["Replay", "Has it been used"],
] as const;

const VERIFY_INDEX = RAIL_STATIONS.findIndex((station) => station.id === "verify");

export function LandingStage() {
  const isReduced = useReducedMotion();
  const stationRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [step, setStep] = useState(0);
  const visibleStep = isReduced ? VERIFY_INDEX : step;

  useEffect(() => {
    if (isReduced) return;

    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= VERIFY_INDEX) {
          window.clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, 1150);

    return () => window.clearInterval(timer);
  }, [isReduced]);

  useEffect(() => {
    stationRefs.current[visibleStep]?.scrollIntoView({
      behavior: isReduced ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [isReduced, visibleStep]);

  const station = RAIL_STATIONS[visibleStep];
  const progress = Math.min(visibleStep, VERIFY_INDEX) / (RAIL_STATIONS.length - 1);
  const isVerify = station.id === "verify";
  const isPayment = station.id === "payment";

  return (
    <div className="w-full border-y border-[var(--line)] py-4 sm:py-5">
      <div className="mb-5 flex items-center justify-between gap-4 font-mono text-[0.62rem] tracking-[0.16em] uppercase sm:mb-6 sm:text-[0.66rem]">
        <p>Authority rail</p>
        <p className="text-[var(--muted-ink)]">Permission before payment</p>
      </div>

      <div className="overflow-x-auto pb-1">
        <ol
          aria-label="Authority rail. Choose a checkpoint to learn what it controls."
          className="relative grid min-w-[42rem] grid-cols-6"
        >
          <span
            aria-hidden
            className="absolute top-[1.05rem] right-[8.333%] left-[8.333%] h-px bg-[var(--line)]"
          />
          <span
            aria-hidden
            className="landing-stage-fill absolute top-[1.05rem] left-[8.333%] h-px w-[83.334%] bg-[var(--cobalt)]"
            style={{ transform: `scaleX(${progress})` }}
          />
          <span
            aria-hidden
            className="absolute top-[1.05rem] left-[75%] w-[16.667%] border-t border-dashed border-[var(--alert)]/65"
          />

          {RAIL_STATIONS.map((item, index) => {
            const isActive = index === visibleStep;
            const isDone = index < visibleStep;
            const isPending = item.pending;

            return (
              <li className="relative" key={item.id}>
                <button
                  aria-current={isActive ? "step" : undefined}
                  className="group flex w-full flex-col items-center gap-2 focus-visible:outline-none"
                  onClick={() => setStep(index)}
                  ref={(element) => {
                    stationRefs.current[index] = element;
                  }}
                  type="button"
                >
                  <span
                    className={cn(
                      "landing-stage-node relative z-10 grid size-[2.15rem] place-items-center rounded-full border bg-[var(--canvas)] font-mono text-[0.58rem] transition-[background-color,border-color,color,transform,box-shadow] duration-300 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-[var(--cobalt)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-[var(--canvas)]",
                      isDone && "border-[var(--graphite)] bg-[var(--graphite)] text-[var(--canvas)]",
                      isActive &&
                        !isPending &&
                        "border-[var(--cobalt)] bg-[var(--cobalt)] text-white shadow-[0_0_0_5px_rgb(49_91_234_/_10%)]",
                      isPending && "border-dashed border-[var(--alert)] text-[var(--alert)]",
                    )}
                  >
                    {item.index}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[0.58rem] tracking-[0.08em] text-[var(--muted-ink)] uppercase transition-colors duration-300 sm:text-[0.65rem]",
                      isActive && "text-[var(--graphite)]",
                      isPending && "text-[var(--alert)]",
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        className={cn(
          "mt-5 grid min-h-[8.5rem] gap-5 border-t border-[var(--line)] pt-5 sm:grid-cols-[0.7fr_1.6fr] sm:gap-8",
          isVerify && "lg:grid-cols-[0.65fr_1.25fr_1fr]",
        )}
      >
        <div>
          <p className="font-mono text-[0.62rem] tracking-[0.15em] text-[var(--muted-ink)] uppercase">
            {station.index} / {station.label}
          </p>
          <p
            className={cn(
              "mt-3 text-sm",
              isPayment ? "text-[var(--alert)]" : "text-[var(--cobalt)]",
            )}
          >
            {station.verb}
          </p>
        </div>

        <div>
          <p className="text-xs text-[var(--muted-ink)]">{station.eyebrow}</p>
          <p className="mt-2 max-w-[46rem] text-[clamp(1rem,1.65vw,1.25rem)] leading-[1.38] tracking-[-0.025em] text-[var(--graphite)]">
            {station.copy}
          </p>
        </div>

        {isVerify ? (
          <dl className="grid content-start gap-2 border-t border-[var(--line)] pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            {VERIFY_CHECKS.map(([label, question]) => (
              <div className="flex items-baseline justify-between gap-4" key={label}>
                <dt className="font-mono text-[0.6rem] tracking-[0.12em] uppercase">{label}</dt>
                <dd className="text-right text-[0.68rem] text-[var(--muted-ink)]">{question}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
