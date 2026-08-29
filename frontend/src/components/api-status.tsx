"use client";

import { useEffect, useState } from "react";

type ApiState = "checking" | "online" | "offline";

const labels: Record<ApiState, string> = {
  checking: "Checking API",
  online: "API online",
  offline: "API offline",
};

export function ApiStatus() {
  const [state, setState] = useState<ApiState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
      "http://localhost:3001";

    async function checkApi() {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          cache: "no-store",
          signal: controller.signal,
        });

        setState(response.ok ? "online" : "offline");
      } catch {
        if (!controller.signal.aborted) {
          setState("offline");
        }
      }
    }

    void checkApi();

    return () => controller.abort();
  }, []);

  const dotClass =
    state === "online"
      ? "bg-emerald-500"
      : state === "offline"
        ? "bg-[#eb6c36]"
        : "bg-[#7a8399]";

  return (
    <div className="inline-flex items-center gap-2 border border-[var(--rule)] bg-white px-3 py-2 text-xs text-[var(--muted)]">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>{labels[state]}</span>
    </div>
  );
}
