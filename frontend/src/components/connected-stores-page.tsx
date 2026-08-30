"use client";

import Link from "next/link";
import { CircleAlertIcon, ExternalLinkIcon, PlaneIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountPageShell } from "@/components/account-page-shell";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { MerchantCapabilities } from "@/lib/contracts";

export function ConnectedStoresPage() {
  const [merchant, setMerchant] = useState<MerchantCapabilities>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.getMerchantProfile(controller.signal)
      .then(({ data }) => setMerchant(data))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof BoundApiError ? caught.message : "The merchant profile could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  return (
    <AccountPageShell activePage="merchants">
      <div className="border-b pb-8">
        <p className="font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">Account / merchants</p>
        <h1 className="mt-3 text-5xl [font-family:var(--font-display)]">Available merchants</h1>
        <p className="mt-4 text-muted-foreground">Merchant identities and protocol capabilities published by the API.</p>
      </div>

      {!merchant && !error ? <div className="mt-7 h-60 rounded-xl border bg-card motion-safe:animate-pulse" /> : null}
      {error ? <div className="mt-7 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><CircleAlertIcon className="size-5 shrink-0" />{error}</div> : null}
      {merchant ? (
        <article className="mt-7 rounded-xl border bg-card p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-12 place-items-center rounded-xl bg-[#3157fa] text-white"><PlaneIcon className="size-6" /></span>
            <ShieldCheckIcon className="size-5 text-emerald-700" />
          </div>
          <h2 className="mt-5 text-2xl [font-family:var(--font-display)]">{merchant.merchant_name}</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{merchant.merchant_id}</p>
          <dl className="mt-6 grid gap-4 border-t pt-5 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Protocol</dt><dd className="mt-1">{merchant.protocol.name} {merchant.protocol.version}</dd></div>
            <div><dt className="text-muted-foreground">Capabilities</dt><dd className="mt-1">{merchant.capabilities.map(({ name }) => name).join(", ")}</dd></div>
          </dl>
          <Link className="mt-6 inline-flex items-center gap-2 text-sm text-[#3157fa]" href="/connected-merchants/vuelaya">View current offers <ExternalLinkIcon className="size-3.5" /></Link>
        </article>
      ) : null}
    </AccountPageShell>
  );
}
