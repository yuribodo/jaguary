"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  BanIcon,
  BotIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  FileCheck2Icon,
  MessageSquareIcon,
  PlaneIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  WifiOffIcon,
} from "lucide-react";
import Link from "next/link";

import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Suggestion,
  Suggestions,
} from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  type AuthorizationSurfaceState,
  unavailableAuthorizationSource,
} from "@/lib/authorization-state";
import {
  apiUrl,
  boundApi,
  BoundApiError,
  createRequestIdentity,
} from "@/lib/bound-api";
import { cn } from "@/lib/utils";
import type {
  AgentIdentity,
  CreateMandateDraftInput,
  Mandate,
  MerchantCapabilities,
  NormalizedCheckout,
  OfferCandidate,
} from "@/lib/contracts";

const TRAVELBOT_ID = "agent_travelbot";
const MARTA_CREDENTIAL_ID = "cred_demo_marta_visa";
const STARTER_PROMPT =
  "Quero viajar de São Paulo para Córdoba, econômica, até US$ 150.";

type SurfaceData = {
  agent: AgentIdentity;
  merchant: MerchantCapabilities;
  offers: OfferCandidate[];
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: SurfaceData }
  | { kind: "error"; error: BoundApiError };

type Phase = "welcome" | "offers" | "review" | "mandate";
type ActionKind = "checkout" | "draft" | "activate" | "revoke" | "refresh";
type ActionState = { kind?: ActionKind; error?: BoundApiError };

function asApiError(error: unknown) {
  if (error instanceof BoundApiError) return error;
  return new BoundApiError({
    message: "Ocorreu um erro inesperado nesta conversa.",
    code: "unexpected_error",
  });
}

function formatMoney({ amount, currency }: { amount: number; currency: string }) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function mandateExpiry(offer: OfferCandidate) {
  return new Date(
    Date.parse(offer.observed_at) + 24 * 60 * 60 * 1000,
  ).toISOString();
}

function cabinLabel(cabin: string) {
  const labels: Record<string, string> = {
    ECONOMY: "Econômica",
    PREMIUM_ECONOMY: "Econômica premium",
    BUSINESS: "Executiva",
    FIRST: "Primeira classe",
  };
  return labels[cabin] ?? cabin;
}

function shortId(value: string, start = 12, end = 8) {
  if (value.length <= start + end + 1) return value;
  return value.slice(0, start) + "…" + value.slice(-end);
}

function conversationStatusLabel(phase: Phase, mandate?: Mandate) {
  if (mandate?.status === "DRAFT") return "Mandato em revisão";
  if (mandate?.status === "ACTIVE") return "Mandato ativo";
  if (mandate?.status === "REVOKED") return "Mandato revogado";
  if (phase === "review") return "Mandato em revisão";
  if (phase === "offers") return "Oferta encontrada";
  return "Conversa nova";
}

function AssistantMessage({
  children,
  text,
  name = "TravelBot",
  identified = true,
}: {
  children?: ReactNode;
  text?: string;
  name?: string;
  identified?: boolean;
}) {
  return (
    <Message className="max-w-full" from="assistant">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-card shadow-xs">
          {name === "TravelBot" ? (
            <BotIcon className="size-4" />
          ) : (
            <CircleAlertIcon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <strong className="text-sm">{name}</strong>
            {identified ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800">
                <ShieldCheckIcon className="size-3" />
                identificado
              </span>
            ) : null}
          </div>
          <MessageContent className="w-full gap-4 overflow-visible text-[15px] leading-7">
            {text ? <p className="max-w-2xl">{text}</p> : null}
            {children}
          </MessageContent>
        </div>
      </div>
    </Message>
  );
}

function UserMessage({ children }: { children: string }) {
  return (
    <Message from="user">
      <MessageContent className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-3 text-sm leading-6">
        {children}
      </MessageContent>
    </Message>
  );
}

function ApiStatus({ loadState }: { loadState: LoadState }) {
  let state: "checking" | "online" | "offline" | "error" = "online";
  if (loadState.kind === "loading") state = "checking";
  if (loadState.kind === "error") {
    state = loadState.error.offline ? "offline" : "error";
  }
  const label = {
    checking: "Conectando",
    online: "API conectada",
    offline: "API offline",
    error: "API com erro",
  }[state];

  return (
    <output
      className={cn(
        "hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex",
        state === "online" && "text-emerald-800",
        (state === "offline" || state === "error") && "text-destructive",
      )}
      aria-live="polite"
    >
      <i
        className={cn(
          "size-1.5 rounded-full bg-current",
          state === "checking" && "animate-pulse",
        )}
        aria-hidden="true"
      />
      {label}
    </output>
  );
}

function AppSidebar({
  data,
  phase,
  mandate,
  onReset,
}: {
  data?: SurfaceData;
  phase: Phase;
  mandate?: Mandate;
  onReset: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  function closeMobile() {
    if (isMobile) setOpenMobile(false);
  }

  function startNewConversation() {
    onReset();
    closeMobile();
  }

  function focusConversation() {
    closeMobile();
    requestAnimationFrame(() => {
      const element = document.getElementById("conversation-start");
      element?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    });
  }

  const hasConversation = phase !== "welcome";
  const conversationStatus = conversationStatusLabel(phase, mandate);

  return (
    <Sidebar className="border-sidebar-border" collapsible="icon">
      <SidebarHeader className="gap-3 border-b border-sidebar-border p-3">
        <div className="flex h-10 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <strong className="text-[1.65rem] font-normal leading-none [font-family:var(--font-serif)] group-data-[collapsible=icon]:hidden">
            <Link className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/">
              Bound
            </Link>
          </strong>
          <SidebarTrigger
            aria-label="Recolher barra lateral"
            className="ml-auto size-9 group-data-[collapsible=icon]:ml-0"
            title="Recolher barra lateral (Ctrl+B)"
          />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-11 border border-sidebar-border bg-background px-3 shadow-none"
              onClick={startNewConversation}
              tooltip="Nova conversa"
            >
              <PlusIcon />
              <span>Nova conversa</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-3 py-4">
          <SidebarGroupLabel className="px-2 font-mono text-[10px] tracking-[0.12em] uppercase">
            Conversas recentes
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {hasConversation ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="h-auto min-h-16 items-start rounded-l-none border-l-2 border-blue-600 px-3 py-3"
                    isActive
                    onClick={focusConversation}
                    tooltip="GRU → COR"
                  >
                    <MessageSquareIcon className="mt-0.5" />
                    <span className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
                      <strong className="truncate font-medium">GRU → COR</strong>
                      <small className="truncate text-xs font-normal text-sidebar-foreground/60">
                        {conversationStatus}
                      </small>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                <li className="px-2 py-3 text-sm text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                  Nenhuma conversa ainda
                </li>
              )}
            </SidebarMenu>
            {hasConversation ? (
              <p className="px-2 pt-7 text-sm text-sidebar-foreground/55 group-data-[collapsible=icon]:hidden">
                Nenhuma outra conversa
              </p>
            ) : null}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="relative border-t border-sidebar-border p-3">
        <details className="group/identity relative">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg px-2 outline-none transition-colors duration-150 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 [&::-webkit-details-marker]:hidden">
            <span className="relative grid size-9 shrink-0 place-items-center rounded-full border border-sidebar-border bg-background">
              <BotIcon className="size-4" />
              <i
                className={cn(
                  "absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-sidebar bg-muted-foreground",
                  data && "bg-emerald-700",
                )}
                aria-hidden="true"
              />
            </span>
            <span className="grid min-w-0 flex-1 text-xs group-data-[collapsible=icon]:hidden">
              <strong className="truncate">
                {data?.agent.display_name ?? "TravelBot"}
              </strong>
              <small className="truncate text-[10px] text-sidebar-foreground/60">
                {data ? "Identidade verificada" : "Verificando identidade…"}
              </small>
            </span>
            <ChevronDownIcon className="size-3 text-sidebar-foreground/50 transition-transform duration-150 group-open/identity:rotate-180 group-data-[collapsible=icon]:hidden" />
          </summary>
          <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-sidebar-border bg-popover p-4 text-popover-foreground shadow-lg group-data-[collapsible=icon]:left-10">
            {data ? (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <ShieldCheckIcon className="size-5 text-emerald-800" />
                  <div className="grid">
                    <strong className="text-sm">Agente identificado</strong>
                    <span className="text-xs text-muted-foreground">
                      Chave pública observada na API
                    </span>
                  </div>
                </div>
                <dl className="grid gap-3 text-xs">
                  <div className="grid grid-cols-[76px_1fr] gap-3 border-t pt-3">
                    <dt className="text-muted-foreground">Agent ID</dt>
                    <dd className="min-w-0 break-all"><code>{data.agent.agent_id}</code></dd>
                  </div>
                  <div className="grid grid-cols-[76px_1fr] gap-3 border-t pt-3">
                    <dt className="text-muted-foreground">Principal</dt>
                    <dd className="min-w-0 break-all"><code>{data.agent.principal_id}</code></dd>
                  </div>
                  <div className="grid grid-cols-[76px_1fr] gap-3 border-t pt-3">
                    <dt className="text-muted-foreground">Chave</dt>
                    <dd className="min-w-0 break-all">
                      <code>{data.agent.verification_key.algorithm} · {data.agent.verification_key.key_id}</code>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[76px_1fr] gap-3 border-t pt-3">
                    <dt className="text-muted-foreground">Build</dt>
                    <dd className="min-w-0 break-all" title={data.agent.build_fingerprint}>
                      <code>{shortId(data.agent.build_fingerprint, 16, 10)}</code>
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                A identidade ainda não pôde ser carregada.
              </p>
            )}
          </div>
        </details>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Header({
  loadState,
  correlationId,
  phase,
  mandate,
}: {
  loadState: LoadState;
  correlationId?: string;
  phase: Phase;
  mandate?: Mandate;
}) {
  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger aria-label="Alternar barra lateral" />
        <div className="grid leading-tight">
          <strong className="text-sm">
            {phase === "welcome" ? "Bound" : "GRU → COR"}
          </strong>
          <span className="hidden text-[10px] text-muted-foreground sm:block">
            {conversationStatusLabel(phase, mandate)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ApiStatus loadState={loadState} />
        <details className="group relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-xs font-medium hover:bg-muted [&::-webkit-details-marker]:hidden">
            Evidência
            <ChevronDownIcon className="size-3 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute top-11 right-0 w-[min(88vw,28rem)] rounded-xl border bg-popover p-4 shadow-xl">
            <span className="block text-[11px] text-muted-foreground">
              Último correlation ID
            </span>
            <code className="mt-2 block break-all text-xs text-blue-800">
              {correlationId ?? "Ainda não disponível"}
            </code>
          </div>
        </details>
      </div>
    </header>
  );
}

function ErrorCard({
  error,
  onRetry,
}: {
  error: BoundApiError;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
      role="alert"
    >
      {error.offline ? (
        <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : (
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      )}
      <div className="min-w-0">
        <strong className="text-sm">
          {error.offline
            ? "Não foi possível conectar ao Bound"
            : "A API recusou esta etapa"}
        </strong>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        {error.offline ? (
          <code className="mt-2 block break-all text-xs">{apiUrl}</code>
        ) : null}
        {error.correlationId ? (
          <p className="mt-2 text-xs text-destructive">
            Correlation ID <code>{error.correlationId}</code>
          </p>
        ) : null}
        {onRetry ? (
          <Button
            className="mt-4"
            onClick={onRetry}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon />
            Tentar novamente
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  merchant,
  busy,
  selected,
  onSelect,
}: {
  offer: OfferCandidate;
  merchant: MerchantCapabilities;
  busy: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-blue-600/10 text-blue-800">
            <PlaneIcon className="size-4" />
          </span>
          <div className="grid">
            <strong className="text-sm">{merchant.merchant_name}</strong>
            <span className="text-xs text-muted-foreground">Oferta encontrada</span>
          </div>
        </div>
        <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          merchant
        </span>
      </div>

      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-6 md:gap-6 md:px-6">
        <div className="grid">
          <strong className="text-3xl font-normal [font-family:var(--font-serif)] md:text-4xl">
            {offer.fulfillment.origin}
          </strong>
          <span className="text-xs text-muted-foreground">
            {formatTime(offer.fulfillment.departure_at)}
          </span>
        </div>
        <div className="grid min-w-0 items-center gap-1 text-center">
          <span className="text-[10px] text-muted-foreground">direto · 3h05</span>
          <div className="relative h-px bg-border">
            <PlaneIcon className="absolute top-1/2 right-0 size-3 -translate-y-1/2 bg-card text-blue-700" />
          </div>
        </div>
        <div className="grid text-right">
          <strong className="text-3xl font-normal [font-family:var(--font-serif)] md:text-4xl">
            {offer.fulfillment.destination}
          </strong>
          <span className="text-xs text-muted-foreground">
            {formatTime(offer.fulfillment.arrival_at)}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 border-y bg-muted/35 text-xs md:grid-cols-3">
        <div className="p-3 md:p-4">
          <dt className="text-muted-foreground">Cabine</dt>
          <dd className="mt-1 font-medium">Econômica</dd>
        </div>
        <div className="border-l p-3 md:p-4">
          <dt className="text-muted-foreground">Merchant</dt>
          <dd className="mt-1 font-medium">{merchant.merchant_name}</dd>
        </div>
        <div className="col-span-2 border-t p-3 md:col-span-1 md:border-t-0 md:border-l md:p-4">
          <dt className="text-muted-foreground">Disponível até</dt>
          <dd className="mt-1 font-medium">{formatDateTime(offer.available_until)}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-5">
        <div className="grid">
          <span className="text-xs text-muted-foreground">Total</span>
          <strong className="text-xl">{formatMoney(offer.total)}</strong>
        </div>
        {selected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <FileCheck2Icon className="size-4" />
            Selecionada
          </span>
        ) : (
          <Button disabled={busy} onClick={onSelect}>
            {busy ? "Criando checkout…" : "Selecionar oferta"}
          </Button>
        )}
      </div>
    </article>
  );
}

function ScopeGrid({
  data,
  offer,
  mandate,
}: {
  data: SurfaceData;
  offer: OfferCandidate;
  mandate?: Mandate;
}) {
  const maxPurchase =
    mandate?.terms.max_per_purchase ?? {
      amount: 15000,
      currency: offer.total.currency,
    };

  const values = [
    ["Agente", data.agent.display_name, data.agent.agent_id],
    ["Merchant", data.merchant.merchant_name, data.merchant.merchant_id],
    [
      "Rota",
      offer.fulfillment.origin + " → " + offer.fulfillment.destination,
      "somente este trajeto",
    ],
    [
      "Cabine",
      cabinLabel(mandate?.terms.cabin ?? "ECONOMY"),
      "sem upgrade autônomo",
    ],
    [
      "Limite",
      formatMoney(maxPurchase),
      "1 uso · oferta " + formatMoney(offer.total),
    ],
    [
      "Expiração",
      formatDateTime(mandate?.terms.expires_at ?? mandateExpiry(offer)),
      "termina automaticamente",
    ],
  ];

  return (
    <dl className="grid grid-cols-1 overflow-hidden rounded-xl border sm:grid-cols-2">
      {values.map(([label, value, note], index) => (
        <div
          className={cn(
            "min-w-0 p-3.5",
            index > 0 && "border-t",
            index === 1 && "sm:border-t-0 sm:border-l",
            index > 1 && index % 2 === 1 && "sm:border-l",
          )}
          key={label}
        >
          <dt className="text-[11px] text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-medium">
            {value}
            <small className="mt-0.5 block truncate font-mono text-[10px] font-normal text-muted-foreground">
              {note}
            </small>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function EvidenceDetails({
  checkout,
  mandate,
}: {
  checkout: NormalizedCheckout;
  mandate?: Mandate;
}) {
  const signed = mandate && mandate.status !== "DRAFT";

  return (
    <details className="group border-t">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <FileCheck2Icon className="size-4 text-muted-foreground" />
          Evidências e detalhes técnicos
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <dl className="mb-3 grid gap-3 rounded-xl bg-muted/50 p-4 text-xs">
        <div>
          <dt className="text-muted-foreground">Checkout ID</dt>
          <dd className="mt-1 break-all"><code>{checkout.terms.checkout_id}</code></dd>
        </div>
        <div className="border-t pt-3">
          <dt className="text-muted-foreground">Hash do checkout</dt>
          <dd className="mt-1 break-all"><code>{checkout.checkout_hash}</code></dd>
        </div>
        <div className="border-t pt-3">
          <dt className="text-muted-foreground">Assinatura merchant</dt>
          <dd className="mt-1"><code>{checkout.merchant_signature.algorithm} · {checkout.merchant_signature.key_id}</code></dd>
        </div>
        {mandate ? (
          <>
            <div className="border-t pt-3">
              <dt className="text-muted-foreground">Mandate ID</dt>
              <dd className="mt-1 break-all"><code>{mandate.terms.mandate_id}</code></dd>
            </div>
            <div className="border-t pt-3">
              <dt className="text-muted-foreground">Credencial lógica</dt>
              <dd className="mt-1">
                {mandate.payment_credential.display}
                <small className="block break-all text-muted-foreground">
                  <code>{mandate.payment_credential.credential_id}</code>
                </small>
              </dd>
            </div>
          </>
        ) : null}
        {signed ? (
          <>
            <div className="border-t pt-3">
              <dt className="text-muted-foreground">Hash dos termos</dt>
              <dd className="mt-1 break-all"><code>{mandate.terms_hash}</code></dd>
            </div>
            <div className="border-t pt-3">
              <dt className="text-muted-foreground">Assinatura principal</dt>
              <dd className="mt-1">
                <code>{mandate.principal_signature.algorithm} · {mandate.principal_signature.key_id}</code>
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="pb-3 text-xs text-muted-foreground">
        O checkout fixa os termos comerciais; ele não é uma decisão de autorização.
      </p>
    </details>
  );
}

function DecisionState({ state }: { state: AuthorizationSurfaceState }) {
  return (
    <div className="flex gap-3 rounded-xl border border-dashed p-3.5">
      <BanIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <span className="text-[10px] text-muted-foreground uppercase">
          Bound Verify / BE-07
        </span>
        <strong className="mt-0.5 block text-sm">{state.label}</strong>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {state.description}
        </p>
      </div>
    </div>
  );
}

function MandateCard({
  data,
  offer,
  checkout,
  mandate,
  decision,
  action,
  confirmRevoke,
  onCreateDraft,
  onActivate,
  onRefresh,
  onAskRevoke,
  onCancelRevoke,
  onRevoke,
}: {
  data: SurfaceData;
  offer: OfferCandidate;
  checkout: NormalizedCheckout;
  mandate?: Mandate;
  decision: AuthorizationSurfaceState;
  action: ActionState;
  confirmRevoke: boolean;
  onCreateDraft: () => void;
  onActivate: () => void;
  onRefresh: () => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
}) {
  const status = mandate?.status ?? "PROPOSTA";
  const isDraft = mandate?.status === "DRAFT";
  const active = mandate?.status === "ACTIVE";
  const revoked = mandate?.status === "REVOKED";

  return (
    <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-blue-600/10 text-blue-800">
            <ShieldCheckIcon className="size-4" />
          </span>
          <div className="grid">
            <strong className="text-sm">Carta de autoridade</strong>
            <span className="text-xs text-muted-foreground">Mandato de viagem · Bound</span>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 font-mono text-[10px]",
            active && "border-emerald-700/30 bg-emerald-700/5 text-emerald-800",
            revoked && "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {status}
        </span>
      </div>

      <div className="space-y-5 p-4 md:p-5">
        <p className="text-sm leading-6">
          Marta autoriza <strong>{data.agent.display_name}</strong> a comprar uma
          passagem de <strong>{offer.fulfillment.origin}</strong> para{" "}
          <strong>{offer.fulfillment.destination}</strong> dentro destes limites:
        </p>

        <ScopeGrid data={data} mandate={mandate} offer={offer} />

        {!mandate ? (
          <div className="flex flex-col gap-3 rounded-xl bg-muted/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="text-sm">Criar primeiro como rascunho</strong>
              <p className="mt-0.5 text-xs text-muted-foreground">
                DRAFT persiste os termos, mas ainda não concede autoridade.
              </p>
            </div>
            <Button
              className="sm:shrink-0"
              disabled={action.kind === "draft"}
              onClick={onCreateDraft}
              variant="outline"
            >
              {action.kind === "draft" ? "Criando DRAFT…" : "Criar DRAFT"}
            </Button>
          </div>
        ) : null}

        {isDraft ? (
          <Confirmation
            approval={{ id: "activate-" + mandate.terms.mandate_id }}
            className="gap-3 border-blue-700/25 bg-blue-700/5 p-4"
            state="approval-requested"
          >
            <ConfirmationRequest>
              <ConfirmationTitle className="grid gap-1 text-foreground">
                <strong>Conceder esta autoridade ao TravelBot?</strong>
                <span className="text-xs font-normal leading-5 text-muted-foreground">
                  A ativação assina os termos. O mandato continuará limitado,
                  expirável e revogável.
                </span>
              </ConfirmationTitle>
              <ConfirmationActions className="self-stretch">
                <ConfirmationAction
                  className="w-full sm:ml-auto sm:w-auto"
                  disabled={action.kind === "activate"}
                  onClick={onActivate}
                >
                  {action.kind === "activate" ? "Ativando…" : "Autorizar TravelBot"}
                </ConfirmationAction>
              </ConfirmationActions>
            </ConfirmationRequest>
          </Confirmation>
        ) : null}

        {active ? (
          <Confirmation
            approval={{
              id: "active-" + mandate.terms.mandate_id,
              approved: true,
            }}
            className="border-emerald-700/25 bg-emerald-700/5 p-4"
            state="output-available"
          >
            <ConfirmationAccepted>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <ShieldCheckIcon className="size-5 shrink-0 text-emerald-800" />
                <div className="grid flex-1">
                  <strong className="text-sm text-foreground">Autoridade ativa</strong>
                  <span className="text-xs text-muted-foreground">
                    Termos assinados; o mandato pode ser revogado a qualquer momento.
                  </span>
                </div>
                <Button
                  disabled={action.kind === "refresh"}
                  onClick={onRefresh}
                  size="sm"
                  variant="ghost"
                >
                  <RefreshCwIcon />
                  Atualizar
                </Button>
              </div>
            </ConfirmationAccepted>
          </Confirmation>
        ) : null}

        {revoked ? (
          <div className="flex gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
            <BanIcon className="size-5 shrink-0 text-destructive" />
            <div className="grid">
              <strong className="text-sm">Autoridade revogada</strong>
              <span className="text-xs text-muted-foreground">
                Encerrada em {formatDateTime(mandate.revoked_at)}
              </span>
            </div>
          </div>
        ) : null}

        {action.error ? <ErrorCard error={action.error} /> : null}
        <EvidenceDetails checkout={checkout} mandate={mandate} />
        {active ? <DecisionState state={decision} /> : null}

        {active && !confirmRevoke ? (
          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Revogar encerra este mandato, não a identidade do agente.
            </p>
            <Button onClick={onAskRevoke} size="sm" variant="ghost">
              <BanIcon />
              Revogar mandato
            </Button>
          </div>
        ) : null}

        {active && confirmRevoke ? (
          <Confirmation
            approval={{ id: "revoke-" + mandate.terms.mandate_id }}
            className="gap-3 border-destructive/30 bg-destructive/5 p-4"
            state="approval-requested"
          >
            <ConfirmationRequest>
              <ConfirmationTitle className="grid gap-1 text-foreground">
                <strong>Revogar esta autoridade?</strong>
                <span className="text-xs font-normal text-muted-foreground">
                  Esta ação encerra o mandato de forma definitiva.
                </span>
              </ConfirmationTitle>
              <ConfirmationActions className="self-stretch">
                <ConfirmationAction onClick={onCancelRevoke} variant="ghost">
                  Cancelar
                </ConfirmationAction>
                <ConfirmationAction
                  disabled={action.kind === "revoke"}
                  onClick={onRevoke}
                  variant="destructive"
                >
                  {action.kind === "revoke" ? "Revogando…" : "Confirmar revogação"}
                </ConfirmationAction>
              </ConfirmationActions>
            </ConfirmationRequest>
          </Confirmation>
        ) : null}
      </div>
    </article>
  );
}

export function TrustedSurface() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [phase, setPhase] = useState<Phase>("welcome");
  const [composerValue, setComposerValue] = useState("");
  const [sentPrompt, setSentPrompt] = useState<string>();
  const [selectedOffer, setSelectedOffer] = useState<OfferCandidate>();
  const [checkout, setCheckout] = useState<NormalizedCheckout>();
  const [mandate, setMandate] = useState<Mandate>();
  const [action, setAction] = useState<ActionState>({});
  const [lastCorrelationId, setLastCorrelationId] = useState<string>();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [decision, setDecision] = useState<AuthorizationSurfaceState>({
    kind: "NOT_REQUESTED",
    label: "Nenhuma decisão solicitada",
    description: "Ativar o mandato não solicita nem presume uma decisão de compra.",
  });

  const loadSurface = useCallback(async (signal?: AbortSignal) => {
    setLoadState({ kind: "loading" });
    setAction({});
    try {
      const [health, agent, merchant, offers] = await Promise.all([
        boundApi.health(signal),
        boundApi.getAgent(TRAVELBOT_ID, signal),
        boundApi.getMerchantProfile(signal),
        boundApi.listOffers(signal),
      ]);
      setLastCorrelationId(
        offers.correlationId ??
          merchant.correlationId ??
          agent.correlationId ??
          health.correlationId,
      );
      setLoadState({
        kind: "ready",
        data: {
          agent: agent.data,
          merchant: merchant.data,
          offers: offers.data,
        },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const apiError = asApiError(error);
      setLastCorrelationId(apiError.correlationId);
      setLoadState({ kind: "error", error: apiError });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void loadSurface(controller.signal));
    return () => controller.abort();
  }, [loadSurface]);

  function startRequest(prompt: string) {
    if (!prompt.trim() || loadState.kind !== "ready") return;
    setSentPrompt(prompt.trim());
    setComposerValue("");
    setSelectedOffer(undefined);
    setCheckout(undefined);
    setMandate(undefined);
    setConfirmRevoke(false);
    setAction({});
    setPhase("offers");
  }

  function handleSubmit(message: PromptInputMessage) {
    startRequest(message.text);
  }

  async function selectOffer(offer: OfferCandidate, data: SurfaceData) {
    setAction({ kind: "checkout" });
    const requestIdentity = createRequestIdentity("checkout");
    try {
      const result = await boundApi.createCheckout(
        {
          intent_id: "intent_surface_" + crypto.randomUUID(),
          agent_id: data.agent.agent_id,
          merchant_id: offer.merchant_id,
          offer_id: offer.offer_id,
          quantity: 1,
          requested_at: offer.observed_at,
        },
        requestIdentity,
      );
      setSelectedOffer(offer);
      setCheckout(result.data);
      setLastCorrelationId(
        result.correlationId ?? requestIdentity.correlationId,
      );
      setAction({});
      setPhase("review");
    } catch (error) {
      const apiError = asApiError(error);
      setLastCorrelationId(
        apiError.correlationId ?? requestIdentity.correlationId,
      );
      setAction({ error: apiError });
    }
  }

  async function createDraft(data: SurfaceData, offer: OfferCandidate) {
    setAction({ kind: "draft" });
    const requestIdentity = createRequestIdentity("mandate_create");
    const input: CreateMandateDraftInput = {
      mandate_id: "mandate_surface_" + crypto.randomUUID(),
      principal_id: data.agent.principal_id,
      agent_id: data.agent.agent_id,
      allowed_merchant_ids: [data.merchant.merchant_id],
      allowed_merchant_categories: ["airline"],
      route: {
        origin: offer.fulfillment.origin,
        destination: offer.fulfillment.destination,
      },
      cabin: "ECONOMY",
      max_per_purchase: { amount: 15000, currency: offer.total.currency },
      max_aggregate: { amount: 15000, currency: offer.total.currency },
      max_uses: 1,
      valid_from: offer.observed_at,
      expires_at: mandateExpiry(offer),
      credential_id: MARTA_CREDENTIAL_ID,
    };

    try {
      const result = await boundApi.createMandateDraft(input, requestIdentity);
      setMandate(result.data);
      setLastCorrelationId(
        result.correlationId ?? requestIdentity.correlationId,
      );
      setAction({});
    } catch (error) {
      const apiError = asApiError(error);
      setLastCorrelationId(
        apiError.correlationId ?? requestIdentity.correlationId,
      );
      setAction({ error: apiError });
    }
  }

  async function activateMandate() {
    if (!mandate) return;
    setAction({ kind: "activate" });
    const requestIdentity = createRequestIdentity("mandate_activate");
    try {
      const result = await boundApi.activateMandate(
        mandate.terms.mandate_id,
        requestIdentity,
      );
      setMandate(result.data);
      setLastCorrelationId(
        result.correlationId ?? requestIdentity.correlationId,
      );
      setDecision(
        await unavailableAuthorizationSource.getState(
          result.data.terms.mandate_id,
        ),
      );
      setAction({});
      setPhase("mandate");
    } catch (error) {
      const apiError = asApiError(error);
      setLastCorrelationId(
        apiError.correlationId ?? requestIdentity.correlationId,
      );
      setAction({ error: apiError });
    }
  }

  async function refreshMandate() {
    if (!mandate) return;
    setAction({ kind: "refresh" });
    try {
      const result = await boundApi.getMandate(mandate.terms.mandate_id);
      setMandate(result.data);
      setLastCorrelationId(result.correlationId);
      setAction({});
    } catch (error) {
      const apiError = asApiError(error);
      setLastCorrelationId(apiError.correlationId);
      setAction({ error: apiError });
    }
  }

  async function revokeMandate() {
    if (!mandate) return;
    setAction({ kind: "revoke" });
    const requestIdentity = createRequestIdentity("mandate_revoke");
    try {
      const result = await boundApi.revokeMandate(
        mandate.terms.mandate_id,
        requestIdentity,
      );
      setMandate(result.data);
      setLastCorrelationId(
        result.correlationId ?? requestIdentity.correlationId,
      );
      setConfirmRevoke(false);
      setAction({});
    } catch (error) {
      const apiError = asApiError(error);
      setLastCorrelationId(
        apiError.correlationId ?? requestIdentity.correlationId,
      );
      setAction({ error: apiError });
    }
  }

  function resetConversation() {
    setPhase("welcome");
    setComposerValue("");
    setSentPrompt(undefined);
    setSelectedOffer(undefined);
    setCheckout(undefined);
    setMandate(undefined);
    setConfirmRevoke(false);
    setAction({});
  }

  const data = loadState.kind === "ready" ? loadState.data : undefined;
  const matchingOffers =
    data?.offers.filter(
      (offer) =>
        offer.fulfillment.origin === "GRU" &&
        offer.fulfillment.destination === "COR",
    ) ?? [];
  const isBusy = loadState.kind === "loading" || Boolean(action.kind);

  return (
    <SidebarProvider
      className="h-dvh min-h-[38rem] overflow-hidden"
      style={{ "--sidebar-width": "17rem" } as CSSProperties}
    >
      <AppSidebar
        data={data}
        mandate={mandate}
        onReset={resetConversation}
        phase={phase}
      />
      <SidebarInset className="h-dvh min-w-0 overflow-hidden">
        <Header
          correlationId={lastCorrelationId}
          loadState={loadState}
          mandate={mandate}
          phase={phase}
        />

        <Conversation className="min-h-0 bg-background">
          <ConversationContent
            className="mx-auto w-full max-w-3xl gap-8 px-4 py-8 md:px-6 md:py-12"
            id="conversation-start"
          >
          <AssistantMessage
            identified={Boolean(data)}
            text="Oi, Marta. Posso buscar uma passagem e preparar um mandato limitado para você revisar. Eu só ganho autoridade depois da sua confirmação explícita."
          >
            {phase === "welcome" ? (
              <Suggestions className="pt-2">
                <Suggestion
                  className="h-auto max-w-[calc(100vw-5rem)] whitespace-normal py-2 text-left"
                  disabled={loadState.kind !== "ready"}
                  onClick={startRequest}
                  suggestion={STARTER_PROMPT}
                />
              </Suggestions>
            ) : null}
          </AssistantMessage>

          {loadState.kind === "loading" ? (
            <AssistantMessage identified={false}>
              <Shimmer className="text-muted-foreground">
                Conferindo identidade do agente e disponibilidade da VuelaYa…
              </Shimmer>
            </AssistantMessage>
          ) : null}

          {loadState.kind === "error" ? (
            <AssistantMessage identified={false} name="Bound">
              <ErrorCard
                error={loadState.error}
                onRetry={() => void loadSurface()}
              />
            </AssistantMessage>
          ) : null}

          {sentPrompt ? <UserMessage>{sentPrompt}</UserMessage> : null}

          {phase !== "welcome" && data ? (
            <AssistantMessage
              text={
                matchingOffers.length
                  ? "Encontrei uma opção direta da VuelaYa dentro do limite. Confira os dados antes de selecionar."
                  : "A consulta terminou, mas a VuelaYa não publicou uma oferta GRU → COR agora."
              }
            >
              {matchingOffers.length ? (
                matchingOffers.map((offer) => (
                  <OfferCard
                    busy={action.kind === "checkout"}
                    key={offer.offer_id}
                    merchant={data.merchant}
                    offer={offer}
                    onSelect={() => void selectOffer(offer, data)}
                    selected={phase === "review" || phase === "mandate"}
                  />
                ))
              ) : (
                <Button
                  className="w-fit"
                  onClick={() => void loadSurface()}
                  variant="outline"
                >
                  <RefreshCwIcon />
                  Consultar novamente
                </Button>
              )}
              {phase === "offers" && action.error ? (
                <ErrorCard error={action.error} />
              ) : null}
            </AssistantMessage>
          ) : null}

          {(phase === "review" || phase === "mandate") &&
          selectedOffer &&
          checkout &&
          data ? (
            <>
              <UserMessage>
                {"Quero seguir com a opção de " +
                  formatMoney(selectedOffer.total) +
                  "."}
              </UserMessage>
              <AssistantMessage text="A VuelaYa fixou o checkout. Agora revise a autoridade separadamente:">
                <MandateCard
                  action={action}
                  checkout={checkout}
                  confirmRevoke={confirmRevoke}
                  data={data}
                  decision={decision}
                  mandate={mandate}
                  offer={selectedOffer}
                  onActivate={() => void activateMandate()}
                  onAskRevoke={() => setConfirmRevoke(true)}
                  onCancelRevoke={() => setConfirmRevoke(false)}
                  onCreateDraft={() => void createDraft(data, selectedOffer)}
                  onRefresh={() => void refreshMandate()}
                  onRevoke={() => void revokeMandate()}
                />
              </AssistantMessage>
            </>
          ) : null}

          {phase === "mandate" && mandate?.status === "ACTIVE" ? (
            <AssistantMessage text="Mandato ativo. Isso ainda não é uma compra nem uma decisão ALLOW; a policy BE-06 existe no backend, mas POST /verify e a reserva BE-07 continuam explicitamente não conectados." />
          ) : null}

          {mandate?.status === "REVOKED" ? (
            <AssistantMessage text="A autoridade foi encerrada. Minha identidade continua ativa, mas este mandato não pode mais ser usado." />
          ) : null}
          </ConversationContent>
          <ConversationScrollButton aria-label="Ir para o fim da conversa" />
        </Conversation>

        <footer className="shrink-0 border-t bg-background px-3 py-3 md:px-6">
          <PromptInput className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                className="min-h-14"
                disabled={loadState.kind !== "ready"}
                onChange={(event) => setComposerValue(event.currentTarget.value)}
                placeholder="Converse com o TravelBot…"
                value={composerValue}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <span className="hidden text-[10px] text-muted-foreground sm:inline">
                  Enter envia · Shift + Enter quebra linha
                </span>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={
                  loadState.kind !== "ready" || !composerValue.trim()
                }
                status={isBusy ? "submitted" : "ready"}
              />
            </PromptInputFooter>
          </PromptInput>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            Sem cartão, pagamento ou decisão de compra nesta superfície.
          </p>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
