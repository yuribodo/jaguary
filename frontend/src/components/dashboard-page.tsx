import Link from "next/link";
import { LayoutDashboardIcon, RadarIcon, ReceiptTextIcon, ShieldCheckIcon, WalletCardsIcon } from "lucide-react";

import { AccountPageShell } from "@/components/account-page-shell";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Stat({ children, icon: Icon, label, note }: { children: React.ReactNode; icon: typeof ReceiptTextIcon; label: string; note: string }) {
  return <article className="rounded-xl border bg-card p-5 shadow-xs"><Icon className="size-4 text-[#334de8]" /><p className="mt-5 text-sm text-muted-foreground">{label}</p><strong className="mt-1 block text-3xl [font-family:var(--font-serif)]">{children}</strong><p className="mt-2 text-xs text-muted-foreground">{note}</p></article>;
}

export function DashboardPage() {
  const totalLimit = 19500;
  const totalUsed = 2780;
  return <AccountPageShell activePage="dashboard">
    <div className="max-w-2xl border-b pb-8"><p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">JaguaryAI / vis\u00e3o geral</p><h1 className="mt-3 text-4xl leading-none [font-family:var(--font-serif)] md:text-5xl">Decis\u00f5es sob seu controle</h1><p className="mt-5 text-base leading-7 text-muted-foreground">Uma vis\u00e3o clara das suas compras, limites e autoridades antes de qualquer agente agir em seu nome.</p></div>
    <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat icon={ReceiptTextIcon} label="Compras conclu\u00eddas" note="R$ 8.200,00 no hist\u00f3rico">4</Stat><Stat icon={WalletCardsIcon} label="Limite dispon\u00edvel" note={`de ${brl.format(totalLimit)} na carteira`}>{brl.format(totalLimit - totalUsed)}</Stat><Stat icon={ShieldCheckIcon} label="Autoridades ativas" note="Jaguary \u00b7 VuelaYa">1</Stat><Stat icon={LayoutDashboardIcon} label="Evid\u00eancias audit\u00e1veis" note="das decis\u00f5es reais consult\u00e1veis">100%</Stat>
    </section>
    <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_.8fr]"><article className="rounded-xl border bg-card p-6 shadow-xs"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Monitoramento de oportunidades</p><h2 className="mt-2 text-2xl [font-family:var(--font-serif)]">Compre quando fizer sentido</h2></div><span className="rounded-full bg-secondary px-2.5 py-1 font-mono text-[10px] text-muted-foreground">EM BREVE</span></div><div className="mt-7 rounded-lg border border-dashed bg-background p-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#334de8]/10 text-[#334de8]"><RadarIcon className="size-4" /></span><div><h3 className="font-medium">Alerta de pre\u00e7o para uma viagem</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Voc\u00ea poder\u00e1 pedir ao Jaguary: “Fa\u00e7a uma compra quando uma passagem de S\u00e3o Paulo para C\u00f3rdoba ficar abaixo de R$ 900”.</p></div></div><p className="mt-4 border-t pt-4 text-xs leading-5 text-muted-foreground">O monitoramento ainda n\u00e3o est\u00e1 conectado a fontes de pre\u00e7o nem pode iniciar compras.</p></div></article><article className="rounded-xl border bg-card p-6 shadow-xs"><p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">Pr\u00f3ximo passo seguro</p><h2 className="mt-2 text-2xl [font-family:var(--font-serif)]">Comece uma conversa</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Descreva a viagem que procura. O Jaguary mostra a oferta e pede sua autoriza\u00e7\u00e3o separadamente.</p><Link className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85" href="/demo">Conversar com Jaguary</Link></article></section>
  </AccountPageShell>;
}
