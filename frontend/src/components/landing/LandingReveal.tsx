"use client";

import { useEffect, useRef, type ReactNode } from "react";

type LandingRevealProps = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export function LandingReveal({
  children,
  className,
  delayMs = 0,
}: LandingRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const show = () => {
      window.setTimeout(() => element.classList.add("is-in"), delayMs);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.classList.add("is-in");
      return;
    }

    const rect = element.getBoundingClientRect();
    const isInView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
    if (isInView) {
      element.classList.add("is-in");
      return;
    }

    element.dataset.ready = "true";

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        show();
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [delayMs]);

  return (
    <div className={className ? `landing-reveal ${className}` : "landing-reveal"} ref={ref}>
      {children}
    </div>
  );
}
