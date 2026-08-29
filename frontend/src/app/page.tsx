import Link from "next/link";

import { ApiStatus } from "@/components/api-status";

const layers = [
  ["Commerce", "UCP checkout"],
  ["Authority", "AP2 mandates"],
  ["Enforcement", "Bound Verify"],
  ["Payment", "Yuno orchestration"],
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between border-b border-[var(--rule)] pb-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-[var(--muted)] uppercase">
            Bound
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Agentic commerce trust layer
          </p>
        </div>
        <ApiStatus />
      </header>

      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
        <div>
          <p className="mb-5 font-mono text-xs tracking-[0.16em] text-[var(--accent)] uppercase">
            Authorization before payment
          </p>
          <h1 className="max-w-3xl text-5xl leading-[1.04] font-semibold tracking-[-0.04em] text-[var(--ink)] sm:text-7xl">
            Agents can act. Bound decides whether they may pay.
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
            A deterministic gate between a shopping agent and payment execution,
            built around verifiable mandates, revocation, replay protection and
            an auditable receipt.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              className="border border-[var(--ink)] bg-[var(--ink)] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-transparent hover:text-[var(--ink)]"
              href="/"
            >
              Create mandate
            </Link>
            <a
              className="border border-[var(--rule)] bg-white px-5 py-3 text-sm font-medium text-[var(--ink)] transition-colors hover:border-[var(--ink)]"
              href="https://github.com/yuribodo/jaguary"
              rel="noreferrer"
              target="_blank"
            >
              View repository
            </a>
          </div>
        </div>

        <div className="border border-[var(--rule)] bg-white p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="font-mono text-xs tracking-[0.14em] text-[var(--muted)] uppercase">
              Transaction path
            </p>
            <span className="border border-[#eb6c36]/30 bg-[#eb6c36]/10 px-2 py-1 font-mono text-[10px] text-[var(--accent)]">
              P0
            </span>
          </div>
          <div className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
            {layers.map(([name, technology], index) => (
              <div
                className={`grid grid-cols-[32px_1fr] gap-4 py-5 ${
                  name === "Enforcement" ? "bg-[#eb6c36]/8" : ""
                }`}
                key={name}
              >
                <span className="pl-2 font-mono text-xs text-[var(--muted)]">
                  0{index + 1}
                </span>
                <div className="flex items-baseline justify-between gap-4 pr-2">
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {name}
                  </span>
                  <span className="text-right font-mono text-xs text-[var(--muted)]">
                    {technology}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
            The agent never receives a reusable payment credential. Yuno is called
            only after Bound creates a reserved authorization.
          </p>
        </div>
      </section>

      <footer className="border-t border-[var(--rule)] pt-5 font-mono text-xs text-[var(--muted)]">
        UCP → AP2 → BOUND VERIFY → YUNO → RECEIPT
      </footer>
    </main>
  );
}
