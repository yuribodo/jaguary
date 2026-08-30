"use client";

import Link from "next/link";
import { CheckCircle2Icon, LayoutDashboardIcon, PauseIcon, PencilIcon, RadarIcon, ReceiptTextIcon, ShieldCheckIcon, WalletCardsIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { AccountPageShell } from "@/components/account-page-shell";

const brl = new Intl.NumberFormat("en-US", { style: "currency", currency: "BRL" });
const monitorStorageKey = "jaguary-price-monitor";

function Stat({ children, icon: Icon, label, note }: { children: React.ReactNode; icon: typeof ReceiptTextIcon; label: string; note: string }) {
  return <article className="rounded-xl border bg-card p-5 shadow-xs"><Icon className="size-4 text-[#334de8]" /><p className="mt-5 text-sm text-muted-foreground">{label}</p><strong className="mt-1 block text-3xl [font-family:var(--font-serif)]">{children}</strong><p className="mt-2 text-xs text-muted-foreground">{note}</p></article>;
}

export function DashboardPage() {
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState("900");
  const totalLimit = 19500;
  const totalUsed = 2780;

  useEffect(() => {
    const saved = window.localStorage.getItem(monitorStorageKey);
    if (!saved) return;
    const rule = JSON.parse(saved) as { active?: boolean; budget?: string };
    setActive(rule.active ?? true);
    setBudget(rule.budget ?? "900");
  }, []);

  function saveRule(nextActive = active) {
    window.localStorage.setItem(monitorStorageKey, JSON.stringify({ active: nextActive, budget }));
    setActive(nextActive);
    setEditing(false);
  }

  return <AccountPageShell activePage="dashboard">
    <div className="max-w-2xl border-b pb-8"><p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">JaguaryAI / overview</p><h1 className="mt-3 text-4xl leading-none [font-family:var(--font-serif)] md:text-5xl">Decisions under your control</h1><p className="mt-5 text-base leading-7 text-muted-foreground">A clear view of your purchases, limits, and permissions before any agent acts on your behalf.</p></div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={ReceiptTextIcon} label="Completed purchases" note="R$8,200.00 in history">4</Stat><Stat icon={WalletCardsIcon} label="Available credit" note={`of ${brl.format(totalLimit)} in your wallet`}>{brl.format(totalLimit - totalUsed)}</Stat><Stat icon={ShieldCheckIcon} label="Active permissions" note="Jaguary · VuelaYa">1</Stat><Stat icon={LayoutDashboardIcon} label="Auditable evidence" note="of real decisions can be reviewed">100%</Stat></section>
    <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><article className="rounded-xl border bg-card p-6 shadow-xs"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Opportunity monitoring</p><h2 className="mt-2 text-2xl [font-family:var(--font-serif)]">Buy when it makes sense</h2></div><span className={active ? "rounded-full bg-emerald-950/8 px-2.5 py-1 font-mono text-[10px] text-emerald-900" : "rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-muted-foreground"}>{active ? "ACTIVE" : "PAUSED"}</span></div><div className="mt-7 rounded-lg border border-dashed bg-background p-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#334de8]/10 text-[#334de8]"><RadarIcon className="size-4" /></span><div className="min-w-0 flex-1"><h3 className="font-medium">São Paulo → Córdoba price alert</h3>{editing ? <div className="mt-3 flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs text-muted-foreground">Alert when price is at or below R$<input aria-label="Price alert limit" className="h-9 w-32 rounded-md border bg-background px-2 text-sm text-foreground" inputMode="numeric" onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))} value={budget} /></label><button className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" onClick={() => saveRule()} type="button">Save rule</button><button className="h-9 px-2 text-sm text-muted-foreground" onClick={() => setEditing(false)} type="button">Cancel</button></div> : <p className="mt-1 text-sm leading-6 text-muted-foreground">Notify me when an economy flight is at or below <strong className="text-foreground">{brl.format(Number(budget || 0))}</strong>.</p>}</div></div><div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><button className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary" onClick={() => setEditing(true)} type="button"><PencilIcon className="size-3.5" />Edit alert</button><button className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary" onClick={() => saveRule(!active)} type="button">{active ? <PauseIcon className="size-3.5" /> : <CheckCircle2Icon className="size-3.5" />}{active ? "Pause monitoring" : "Resume monitoring"}</button></div></div><p className="mt-4 text-xs leading-5 text-muted-foreground">This alert is saved on this device. It records a purchase decision only after you explicitly approve a matching offer.</p></article><article className="rounded-xl border bg-card p-6 shadow-xs"><p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Next safe step</p><h2 className="mt-2 text-2xl [font-family:var(--font-serif)]">Start a conversation</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Describe the trip you want. Jaguary shows the offer and asks for your separate approval.</p><Link className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85" href="/demo">Chat with Jaguary</Link></article></section>
  </AccountPageShell>;
}
