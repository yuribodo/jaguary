"use client";

import "lenis/dist/lenis.css";

import { ReactLenis } from "lenis/react";

export function LandingSmoothScroll() {
  return (
    <ReactLenis
      root
      options={{
        autoRaf: true,
        lerp: 0.095,
        respectReducedMotion: true,
        smoothWheel: true,
        stopInertiaOnNavigate: true,
      }}
    />
  );
}
