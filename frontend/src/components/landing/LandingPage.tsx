import { LandingCta } from "@/components/landing/LandingCta";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingHow } from "@/components/landing/LandingHow";
import { LandingSmoothScroll } from "@/components/landing/LandingSmoothScroll";

export function LandingPage() {
  return (
    <div className="landing min-h-svh" lang="en">
      <LandingSmoothScroll />
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-[var(--cobalt)] focus:px-3 focus:py-2 focus:text-white"
        href="#how"
      >
        Skip to how it works
      </a>
      <LandingHero />
      <LandingHow />
      <LandingCta />
    </div>
  );
}
