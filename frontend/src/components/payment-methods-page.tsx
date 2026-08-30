"use client";

import { Menu } from "@base-ui/react/menu";
import { useCallback, useEffect, useState } from "react";
import {
  CircleAlertIcon,
  CopyIcon,
  CreditCardIcon,
  EllipsisVerticalIcon,
  LockKeyholeIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";

import { AccountPageShell } from "@/components/account-page-shell";
import { Button } from "@/components/ui/button";
import { boundApi, BoundApiError } from "@/lib/bound-api";
import type { PaymentMethodSummary } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "error";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function networkMark(network: PaymentMethodSummary["network"]) {
  if (network === "MASTERCARD") return "MC";
  if (network === "VISA") return "VISA";
  return null;
}

function MethodMark({ network }: { network: PaymentMethodSummary["network"] }) {
  const mark = networkMark(network);
  return (
    <span className={cn(
      "grid size-12 shrink-0 place-items-center rounded-lg border bg-[#faf9f5] font-sans text-[11px] font-black italic tracking-[-0.08em]",
      network === "VISA" ? "text-[#1a4db3]" : network === "MASTERCARD" ? "text-[#b5412d]" : "text-muted-foreground",
    )}>
      {mark ?? <CreditCardIcon className="size-4" />}
    </span>
  );
}

function PaymentMethodsSkeleton() {
  return (
    <div aria-label="Loading payment methods" className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-4"><i className="block h-4 w-28 rounded bg-muted motion-safe:animate-pulse" /></div>
      {[0, 1].map((item) => (
        <div className="flex min-h-24 items-center gap-4 border-b px-5 py-4 last:border-b-0" key={item}>
          <i className="size-12 shrink-0 rounded-lg bg-muted motion-safe:animate-pulse" />
          <span className="grid flex-1 gap-2">
            <i className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />
            <i className="h-3 w-56 max-w-full rounded bg-muted motion-safe:animate-pulse" />
          </span>
          <i className="hidden h-3 w-24 rounded bg-muted motion-safe:animate-pulse sm:block" />
        </div>
      ))}
    </div>
  );
}

function MethodActions({ method, onCopied }: {
  method: PaymentMethodSummary;
  onCopied: (message: string) => void;
}) {
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(method.credential_id);
      onCopied("Secure payment reference copied.");
    } catch {
      onCopied("Could not copy the payment reference.");
    }
  }

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Actions for ${method.label}`}
        className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <EllipsisVerticalIcon className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" className="z-50 outline-none" sideOffset={6}>
          <Menu.Popup className="min-w-52 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none transition-[transform,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Menu.Item
              className="flex min-h-9 cursor-default items-center gap-2 rounded-md px-2 text-xs outline-none data-highlighted:bg-accent"
              onClick={() => void copyReference()}
            >
              <CopyIcon className="size-3.5" />Copy secure reference
            </Menu.Item>
            <Menu.Item
              className="flex min-h-9 cursor-not-allowed items-center gap-2 rounded-md px-2 text-xs text-muted-foreground opacity-60 outline-none"
              disabled
            >
              <Trash2Icon className="size-3.5" />Remove — not connected
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function MethodList({ methods, onCopied }: {
  methods: PaymentMethodSummary[];
  onCopied: (message: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Saved methods</h2>
      </div>
      {methods.map((method) => (
        <article className="grid grid-cols-[48px_minmax(0,1fr)_40px] gap-x-4 gap-y-2 border-b px-5 py-5 last:border-b-0 sm:grid-cols-[48px_minmax(0,1fr)_auto_40px] sm:items-center" key={method.credential_id}>
          <MethodMark network={method.network} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{method.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Available for authorized purchases</p>
          </div>
          <p className="col-start-2 text-xs text-muted-foreground sm:col-start-auto sm:text-right">Added {formatDate(method.created_at)}</p>
          <div className="col-start-3 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto sm:justify-self-auto">
            <MethodActions method={method} onCopied={onCopied} />
          </div>
        </article>
      ))}
    </div>
  );
}

function PaymentMethodsContent() {
  const [methods, setMethods] = useState<PaymentMethodSummary[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [enrollmentNotice, setEnrollmentNotice] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const loadMethods = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setErrorMessage(undefined);
    try {
      const result = await boundApi.listPaymentMethods(signal);
      setMethods(result.data);
      setLoadState("ready");
    } catch (caught) {
      if (signal?.aborted) return;
      setErrorMessage(caught instanceof BoundApiError ? caught.message : "Payment methods could not be loaded right now.");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void boundApi.listPaymentMethods(controller.signal).then((result) => {
      setMethods(result.data);
      setLoadState("ready");
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      setErrorMessage(caught instanceof BoundApiError ? caught.message : "Payment methods could not be loaded right now.");
      setLoadState("error");
    });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <header>
        <p className="panel-label">Account / payment methods</p>
        <div className="mt-4 grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <h1 className="text-4xl leading-none [font-family:var(--font-display)] md:text-5xl">Payment methods</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Manage the payment methods your agents can use for authorized purchases.</p>
          </div>
          <Button className="h-10 px-4 max-sm:w-full" onClick={() => setEnrollmentNotice((visible) => !visible)}>
            <PlusIcon />Add payment method
          </Button>
        </div>
      </header>

      {enrollmentNotice ? (
        <p aria-live="polite" className="mt-6 rounded-lg border bg-[#faf9f5] px-4 py-3 text-xs leading-5 text-muted-foreground">
          Secure enrollment isn&apos;t connected yet. It will open a provider-hosted form so Jaguary never receives the full card number or CVV.
        </p>
      ) : null}

      <section className="mt-9">
        {loadState === "loading" ? <PaymentMethodsSkeleton /> : null}

        {loadState === "error" ? (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed bg-card p-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-red-50 text-red-600"><CircleAlertIcon className="size-4" /></span>
              <h2 className="mt-4 text-lg font-semibold">Couldn&apos;t load payment methods</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorMessage}</p>
              <Button className="mt-5" onClick={() => void loadMethods()} variant="outline"><RefreshCwIcon />Try again</Button>
            </div>
          </div>
        ) : null}

        {loadState === "ready" && methods.length === 0 ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Saved methods</h2></div>
            <div className="grid min-h-56 place-items-center p-8 text-center">
              <div className="max-w-sm">
                <CreditCardIcon className="mx-auto size-5 text-muted-foreground" />
                <h3 className="mt-3 text-sm font-semibold">No saved methods</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">A payment method will appear here after secure provider enrollment is connected.</p>
              </div>
            </div>
          </div>
        ) : null}

        {loadState === "ready" && methods.length > 0 ? <MethodList methods={methods} onCopied={setCopyMessage} /> : null}
      </section>

      <p aria-live="polite" className="sr-only">{copyMessage}</p>
      <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" />
        Card details stay with the payment provider. Jaguary stores only a secure reference.
      </p>
    </div>
  );
}

export function PaymentMethodsPage() {
  return <AccountPageShell activePage="payment-methods"><PaymentMethodsContent /></AccountPageShell>;
}
