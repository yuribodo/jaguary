"use client";

import { useEffect, useRef } from "react";

const GLYPHS = " ··--==+*ox#";

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

type FieldSize = {
  width: number;
  height: number;
  cell: number;
};

function measure(board: HTMLCanvasElement, ctx: CanvasRenderingContext2D): FieldSize {
  const parent = board.parentElement;
  const width = parent?.clientWidth ?? 0;
  const height = parent?.clientHeight ?? 0;
  const cell = width < 720 ? 16 : 14;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  board.width = Math.floor(width * ratio);
  board.height = Math.floor(height * ratio);
  board.style.width = `${width}px`;
  board.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width, height, cell };
}

function paint(
  ctx: CanvasRenderingContext2D,
  size: FieldSize,
  time: number,
  isReduced: boolean,
  tone: "paper" | "ink"
) {
  const { width, height, cell } = size;
  ctx.clearRect(0, 0, width, height);
  ctx.font = `500 ${cell - 3}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const cols = Math.ceil(width / cell) + 1;
  const rows = Math.ceil(height / cell) + 1;
  const railY = rows * 0.52;
  const scan = isReduced ? 0.42 : (time * 0.000045) % 1.2 - 0.1;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const nx = x / cols;
      const dy = (y - railY) / rows;
      const along = Math.exp(-dy * dy * 48);
      const travel = Math.exp(-(((nx - scan) * 7) ** 2));
      const node =
        Math.exp(-((((nx - 0.12) * 18) ** 2) + (dy * 22) ** 2)) +
        Math.exp(-((((nx - 0.31) * 18) ** 2) + (dy * 22) ** 2)) +
        Math.exp(-((((nx - 0.5) * 18) ** 2) + (dy * 22) ** 2)) +
        Math.exp(-((((nx - 0.69) * 18) ** 2) + (dy * 22) ** 2)) +
        Math.exp(-((((nx - 0.88) * 18) ** 2) + (dy * 22) ** 2));
      const noise = hash(x, y + Math.floor(time / 900));
      const field = along * 0.55 + travel * along * 0.8 + node * 0.9 + noise * 0.12;
      if (field < 0.16) continue;

      const glyph = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor(field * (GLYPHS.length - 1)))];
      const fade = Math.min(nx * 4, (1 - nx) * 4, 1) * Math.min(y / 6, (rows - y) / 8, 1);
      const cobalt = travel * along + node * 0.45;
          ctx.fillStyle =
            cobalt > 0.35
              ? `rgba(49, 91, 234, ${(tone === "ink" ? 0.28 : 0.18) + cobalt * 0.42 * fade})`
              : tone === "ink"
                ? `rgba(238, 233, 220, ${(0.1 + field * 0.2) * fade})`
                : `rgba(23, 26, 23, ${(0.08 + field * 0.22) * fade})`;
      ctx.fillText(glyph, x * cell + cell / 2, y * cell + cell / 2);
    }
  }
}

export function LandingAsciiField({ tone = "paper" }: { tone?: "paper" | "ink" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const board = canvasRef.current;
    if (!board) return;
    const ctx = board.getContext("2d");
    if (!ctx) return;

    const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let size = measure(board, ctx);
    paint(ctx, size, 0, isReduced, tone);

    const onResize = () => {
      size = measure(board, ctx);
      if (isReduced) paint(ctx, size, 0, true, tone);
    };
    window.addEventListener("resize", onResize);

    if (isReduced) {
      return () => window.removeEventListener("resize", onResize);
    }

    let raf = 0;
    const tick = (time: number) => {
      if (document.visibilityState === "visible") paint(ctx, size, time, false, tone);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [tone]);

  return (
    <canvas
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
      ref={canvasRef}
    />
  );
}
