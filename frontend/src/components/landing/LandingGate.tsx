"use client";

import { useEffect, useRef, useState } from "react";

import { useMediaQuery, useReducedMotion } from "@/components/landing/use-reduced-motion";
import { cn } from "@/lib/utils";

const GATES = [
  {
    index: "01",
    title: "Who signed",
    line: "Marta. Not the agent.",
    protocol: ["principal", "Marta"],
  },
  {
    index: "02",
    title: "What is allowed",
    line: "GRU → COR. Ceiling US$ 150.",
    protocol: ["merchant", "VuelaYa"],
  },
  {
    index: "03",
    title: "If it repeats",
    line: "One use. Revoke cuts the rail.",
    protocol: ["replay", "unused"],
  },
] as const;

export function LandingGate() {
  const isReduced = useReducedMotion();
  const isPinned = useMediaQuery("(min-width: 768px)", true) && !isReduced;
  const sectionRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (isReduced) {
      setPhase(GATES.length - 1);
      if (fillRef.current) fillRef.current.style.clipPath = "inset(0 0 0 0)";
      return;
    }

    let target = 0;
    let current = 0;
    let frame = 0;
    let running = false;
    let lastPhase = 0;

    const paint = (value: number) => {
      if (fillRef.current) {
        fillRef.current.style.clipPath = `inset(0 ${Math.max(0, 100 - value * 100)}% 0 0)`;
      }
      const nextPhase = Math.min(GATES.length - 1, Math.floor(value * 2.999));
      if (nextPhase !== lastPhase) {
        lastPhase = nextPhase;
        setPhase(nextPhase);
      }
    };

    const tick = () => {
      current += (target - current) * 0.1;
      if (Math.abs(target - current) < 0.0015) {
        current = target;
        paint(current);
        running = false;
        return;
      }
      paint(current);
      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      frame = window.requestAnimationFrame(tick);
    };

    if (!isPinned) {
      target = 0.12;
      start();
      const timer = window.setInterval(() => {
        target = target >= 0.92 ? 0.08 : Math.min(1, target + 0.42);
        start();
      }, 2400);
      return () => {
        window.clearInterval(timer);
        window.cancelAnimationFrame(frame);
      };
    }

    const section = sectionRef.current;
    if (!section) return;

    const measure = () => {
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      target = Math.min(1, Math.max(0, -rect.top / travel));
      start();
    };

    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [isPinned, isReduced]);

  const gate = GATES[phase];

  return (
    <section
      className={cn("bg-[var(--canvas)]", isReduced ? "min-h-svh" : "md:h-[240vh]")}
      id="how"
      ref={sectionRef}
    >
      <div className="md:sticky md:top-0 md:flex md:h-svh md:flex-col md:overflow-hidden">
        <div className="relative flex min-h-svh flex-1 flex-col justify-between overflow-hidden px-6 py-8 md:px-10 md:py-10">
          <div className="relative z-10 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm text-[var(--muted-ink)]">How it works</p>
              <h2 className="mt-2 max-w-[12ch] text-[1.05rem] tracking-[-0.03em] text-[var(--graphite)] md:text-[1.15rem]">
                Bound reads the letter. Payment does not start.
              </h2>
            </div>
            <ol className="flex gap-4 font-mono text-[0.68rem] tracking-[0.16em] uppercase">
              {GATES.map((item, index) => (
                <li
                  className={cn(
                    "transition-colors duration-300 ease-[var(--ease-out)]",
                    index === phase ? "text-[var(--graphite)]" : "text-[var(--muted-ink)]/45"
                  )}
                  key={item.index}
                >
                  {item.index}
                </li>
              ))}
            </ol>
          </div>

          <div aria-hidden className="landing-gate-word pointer-events-none select-none">
            <span className="landing-gate-word-ghost">WAIT</span>
            <span
              className="landing-gate-word-fill"
              ref={fillRef}
              style={{ clipPath: "inset(0 100% 0 0)" }}
            >
              WAIT
            </span>
          </div>

          <div className="relative z-10 grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-12">
            <div className="min-h-[6.5rem]">
              <p key={gate.index} className="landing-gate-copy">
                <span className="mb-3 block font-mono text-[0.68rem] tracking-[0.16em] text-[var(--muted-ink)] uppercase">
                  {gate.index} / {gate.title}
                </span>
                <span className="block max-w-[14ch] text-[clamp(1.7rem,3.6vw,3rem)] leading-[0.96] font-semibold tracking-[-0.045em] [font-family:var(--font-display)]">
                  {gate.line}
                </span>
              </p>
            </div>

            <dl className="font-mono text-[0.68rem] tracking-[0.12em] text-[var(--muted-ink)] uppercase">
              <div className="flex justify-between gap-8 md:justify-end">
                <dt>{gate.protocol[0]}</dt>
                <dd className="text-[var(--graphite)]">{gate.protocol[1]}</dd>
              </div>
              <div className="mt-2 flex justify-between gap-8 md:justify-end">
                <dt>decision</dt>
                <dd className="landing-wait text-[var(--alert)]">wait</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
