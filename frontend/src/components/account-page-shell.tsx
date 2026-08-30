"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  BotIcon,
  CreditCardIcon,
  HandshakeIcon,
  HistoryIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type AccountPage = "payment-methods" | "purchases" | "merchants";

const pages = [
  { key: "payment-methods", href: "/metodos-de-pagamento", label: "M\u00e9todos de pagamento", icon: CreditCardIcon },
  { key: "purchases", href: "/compras", label: "Compras", icon: HistoryIcon },
  { key: "merchants", href: "/lojas-conectadas", label: "Lojas conectadas", icon: HandshakeIcon },
] as const;

export function AccountPageShell({
  activePage,
  children,
}: {
  activePage: AccountPage;
  children: ReactNode;
}) {
  return (
    <SidebarProvider
      className="min-h-dvh"
      style={{ "--sidebar-width": "17rem" } as CSSProperties}
    >
      <Sidebar className="border-sidebar-border" collapsible="icon">
        <SidebarHeader className="gap-3 border-b border-sidebar-border p-3">
          <div className="flex h-10 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <Link className="text-[1.65rem] font-normal leading-none [font-family:var(--font-serif)] group-data-[collapsible=icon]:hidden" href="/">
              Bound
            </Link>
            <SidebarTrigger aria-label="Recolher barra lateral" className="ml-auto size-9 group-data-[collapsible=icon]:ml-0" />
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link href="/" />} className="h-11 border border-sidebar-border bg-background px-3 shadow-none" tooltip="Voltar para a conversa">
                <><ArrowLeftIcon /><span>Voltar para a conversa</span></>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 py-4">
            <SidebarGroupLabel className="px-2 font-mono text-[10px] tracking-[0.12em] uppercase">Sua conta</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {pages.map((page) => {
                  const Icon = page.icon;
                  return <SidebarMenuItem key={page.key}><SidebarMenuButton render={<Link href={page.href} />} isActive={page.key === activePage} tooltip={page.label}><><Icon /><span>{page.label}</span></></SidebarMenuButton></SidebarMenuItem>;
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex min-h-12 items-center gap-3 rounded-lg px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-sidebar-border bg-background"><BotIcon className="size-4" /></span>
            <span className="grid text-xs group-data-[collapsible=icon]:hidden"><strong>TravelBot</strong><small className="text-[10px] text-sidebar-foreground/60">Identidade verificada</small></span>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="flex h-16 items-center border-b bg-background/95 px-4 backdrop-blur md:px-6"><SidebarTrigger aria-label="Alternar barra lateral" /><span className="ml-2 text-sm text-muted-foreground">Conta</span></header>
        <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
