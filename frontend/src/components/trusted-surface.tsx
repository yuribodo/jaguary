"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowUpIcon,
  ArrowRightIcon,
  BotIcon,
  BriefcaseBusinessIcon,
  FlaskConicalIcon,
  CheckIcon,
  CheckCheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleIcon,
  CopyIcon,
  ExternalLinkIcon,
  FingerprintIcon,
  InfoIcon,
  MicIcon,
  MicOffIcon,
  PencilIcon,
  PlaneIcon,
  ReceiptTextIcon,
  ReplyIcon,
  RefreshCwIcon,
  RouteIcon,
  ShieldCheckIcon,
  SquareIcon,
  WalletCardsIcon,
  WifiOffIcon,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStickToBottomContext } from "use-stick-to-bottom";

import { AppSidebar } from "@/components/app-sidebar";
import { useAuthenticatedPrincipalSession } from "@/components/authenticated-page";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
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
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  apiUrl,
  boundApi,
  BoundApiError,
  createRequestIdentity,
} from "@/lib/bound-api";
import { writePendingBiometricConsent } from "@/lib/biometric-consent";
import { useRealtimeVoice } from "@/hooks/use-realtime-voice";
import { cn } from "@/lib/utils";
import {
  travelQuickReplyGroup,
  type TravelQuickReplyGroup,
} from "@/lib/travel-quick-replies";
import {
  conversationStateLabels,
  conversationTitle,
  readRecentConversationIds,
  writeRecentConversationIds,
} from "@/lib/conversation-history";
import type {
  AgentIdentity,
  AuditTimeline,
  AuditTimelineEvent,
  OfferCandidate,
  OrderReceipt,
  RequiredTravelIntentField,
  TravelBotConversation,
  TravelBotMessage,
  TravelBotState,
  TravelWatch,
} from "@/lib/contracts";

const TRAVELBOT_ID = "agent_travelbot";
const SHOW_DEVELOPMENT_SIMULATOR = process.env.NODE_ENV === "development";

function updateConversationUrl(conversationId: string, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  url.searchParams.set("conversation", conversationId);
  window.history[mode === "push" ? "pushState" : "replaceState"](
    null,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

const STARTER_PROMPTS = [
  {
    description: "3 days · flexible dates",
    icon: PlaneIcon,
    prompt: "Help me plan a three-day weekend escape. My dates are flexible.",
    title: "Weekend escape",
  },
  {
    description: "Flights, stops and trade-offs",
    icon: RouteIcon,
    prompt: "Compare flight routes, stops, prices, and trade-offs for my trip.",
    title: "Compare a route",
  },
  {
    description: "Schedule-first options",
    icon: BriefcaseBusinessIcon,
    prompt: "Help me plan a work trip, prioritizing my schedule and practical flight times.",
    title: "Plan a work trip",
  },
];

type LoadState = "loading" | "ready" | "error";
type BusyState = "authorizing" | "creating" | "deleting" | "simulating" | "switching" | "sending" | "verifying" | "watching" | null;
type TurnMode = "authority" | "chat";
type FailedTurn = {
  text: string;
  identity: ReturnType<typeof createRequestIdentity>;
  mode: TurnMode;
};
type SubmitTurnOptions = {
  identity?: ReturnType<typeof createRequestIdentity>;
  mode?: TurnMode;
};

function asApiError(error: unknown) {
  if (error instanceof BoundApiError) {
    if (error.code === "principal_attestation_required" || error.code === "agent_attestation_required") {
      return new BoundApiError({
        message: "Verify your identity in Identity & trust, then confirm this purchase again.",
        code: error.code,
        status: error.status,
        correlationId: error.correlationId,
        offline: error.offline,
      });
    }
    if (error.code === "agent_attestation_provider_unavailable") {
      return new BoundApiError({
        message: "The secure selfie session could not be opened. Your authority remains inactive; try again.",
        code: error.code,
        status: error.status,
        correlationId: error.correlationId,
        offline: error.offline,
      });
    }
    if (error.status === 503) {
      return new BoundApiError({
        message: "The search or TravelBot did not respond in time. Your data is still saved; try again.",
        code: error.code,
        status: error.status,
        correlationId: error.correlationId,
        offline: error.offline,
      });
    }
    return error;
  }
  return new BoundApiError({
    message: "An unexpected error occurred in this conversation.",
    code: "unexpected_error",
  });
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

function formatMoneyCompact(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function formatLocalDate(local: string | undefined, fallback: string) {
  const date = local?.slice(0, 10) ?? fallback.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`));
}

function formatLocalTime(local: string | undefined, fallback: string) {
  return local?.slice(11, 16) ?? formatTime(fallback);
}

function formatTicketDate(local: string | undefined, fallback: string) {
  const date = local?.slice(0, 10) ?? fallback.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    weekday: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`)).replaceAll(",", "").toUpperCase().replace("SEPT", "SEP");
}

function formatTicketShortDate(local: string | undefined, fallback: string) {
  const date = local?.slice(0, 10) ?? fallback.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00.000Z`)).replace("Sept", "Sep").toUpperCase();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function watchExpiryForDeparture(departure: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(departure);
  const month = /^(\d{4})-(\d{2})$/.exec(departure);
  if (day) return `${departure}T23:59:59.999Z`;
  if (month) {
    const year = Number(month[1]);
    const monthNumber = Number(month[2]);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    return `${departure}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`;
  }
  throw new BoundApiError({ message: "The departure date is not valid for monitoring.", code: "invalid_departure_date" });
}

function formatTicketDuration(minutes?: number) {
  if (minutes === undefined) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}H ${rest}M` : `${hours}H`;
}

function cabinLabel(cabin: OfferCandidate["fulfillment"]["cabin"] | null) {
  return ({
    ECONOMY: "Economy",
    PREMIUM_ECONOMY: "Premium economy",
    BUSINESS: "Business",
    FIRST: "First class",
  } as const)[cabin ?? "ECONOMY"];
}

function stopLabel(stops?: number) {
  if (stops === undefined) return undefined;
  if (stops === 0) return "Nonstop";
  return `${stops} ${stops === 1 ? "stop" : "stops"}`;
}

const airportCityLabels: Record<string, string> = {
  AEP: "Buenos Aires",
  COR: "Córdoba",
  EZE: "Buenos Aires",
  GIG: "Rio de Janeiro",
  GRU: "São Paulo",
  JFK: "New York",
  LHR: "London",
};

function freshnessLabel(observedAt: string) {
  return `at ${formatTime(observedAt)}`;
}

function officialFlightHref(offer: OfferCandidate) {
  const source = new URL(offer.source_url);
  if (offer.merchant_id === "merchant_vuelaya" && source.hostname === "demo.vuelaya.example") {
    return `/lojas-conectadas/vuelaya/voos/${encodeURIComponent(offer.offer_id)}`;
  }
  return offer.source_url;
}

function shortId(value: string, start = 10, end = 6) {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${end ? value.slice(-end) : ""}`;
}

const missingFieldLabels: Record<RequiredTravelIntentField, string> = {
  origin_iata: "origin",
  destination_iata: "destination",
  departure_date: "date",
  passenger_count: "passengers",
  cabin: "cabin",
  max_total_budget: "budget",
};

function messageCorrelationId(conversation?: TravelBotConversation) {
  return conversation?.messages.at(-1)?.correlation_id;
}

function AssistantMessage({ message }: { message: TravelBotMessage }) {
  return (
    <div className="w-full">
      <Message className="max-w-full" from="assistant">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center text-blue-700">
            <BotIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2">
              <strong className="text-xs">TravelBot</strong>
              <span className="inline-flex items-center gap-1.5 text-[10px] text-emerald-700">
                <i className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                identified
              </span>
              <time className="text-[10px] text-muted-foreground" dateTime={message.created_at}>
                {formatTime(message.created_at)}
              </time>
            </div>
            <MessageContent className="max-w-2xl whitespace-pre-wrap text-[13px] leading-6">
              {message.content}
            </MessageContent>
          </div>
        </div>
      </Message>
    </div>
  );
}

function UserMessage({
  message,
  status,
}: {
  message: Pick<TravelBotMessage, "content" | "created_at">;
  status?: "failed" | "sending" | "sent";
}) {
  const statusLabel = status === "failed" ? "not sent" : status === "sending" ? "sending…" : "sent";

  return (
    <Message from="user">
      <MessageContent className="max-w-[92%] whitespace-pre-wrap rounded-xl rounded-br-sm border bg-secondary px-3.5 py-2.5 text-[13px] leading-6 sm:max-w-[82%]">
        {message.content}
        <span className="flex items-center justify-end gap-1.5 text-[9px] text-muted-foreground">
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
          <span aria-live="polite" className={cn(status === "failed" && "text-destructive")}>{statusLabel}</span>
        </span>
      </MessageContent>
    </Message>
  );
}

function QuickReplies({
  disabled,
  group,
  onCustomAnswer,
  onSelect,
}: {
  disabled: boolean;
  group: TravelQuickReplyGroup;
  onCustomAnswer: () => void;
  onSelect: (value: string) => void;
}) {
  const headingId = `quick-replies-${group.field}`;

  return (
    <section aria-labelledby={headingId} className="ml-10 max-w-2xl">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="panel-label flex items-center gap-1.5 text-blue-700">
            <ReplyIcon aria-hidden="true" className="size-3" />
            Quick answer
          </p>
          <h2 className="mt-1 text-sm font-semibold tracking-[-0.01em]" id={headingId}>{group.question}</h2>
        </div>
        <button
          className="min-h-7 rounded-md px-1.5 text-[11px] text-muted-foreground underline-offset-4 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={disabled}
          onClick={onCustomAnswer}
          type="button"
        >
          or type your own answer below
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={`Suggested answers: ${group.question}`}>
        {group.options.map((option) => (
          <Button
            className="group h-auto min-h-14 justify-start gap-3 whitespace-normal rounded-xl border-foreground/15 bg-background px-3.5 py-2.5 text-left shadow-[0_1px_0_rgb(20_21_17/0.03)] transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:border-blue-700/35 hover:bg-blue-50/45 hover:shadow-[0_5px_16px_rgb(49_87_250/0.08)] focus-visible:border-blue-700 motion-reduce:transform-none"
            disabled={disabled}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
            variant="outline"
          >
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-foreground/20 bg-panel transition-colors group-hover:border-blue-600 group-hover:bg-blue-600/8">
              <i className="size-1.5 rounded-full bg-blue-700 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-foreground">{option.label}</span>
              <span className="mt-0.5 block truncate font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">{option.description}</span>
            </span>
            <ArrowRightIcon aria-hidden="true" className="size-3.5 shrink-0 -translate-x-1 text-blue-700 opacity-0 transition-[opacity,transform] group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transform-none" />
          </Button>
        ))}
      </div>
    </section>
  );
}

type ChatPresenceItemProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  enter?: boolean;
  layout?: boolean;
};

const ChatPresenceItem = forwardRef<HTMLDivElement, ChatPresenceItemProps>(function ChatPresenceItem({
  children,
  className,
  delay = 0,
  enter = true,
  layout = true,
}, ref) {
  const reduceMotion = useReducedMotion();
  const restingTransform = "translateY(0px)";

  return (
    <motion.div
      className={className}
      layout={!reduceMotion && layout ? "position" : false}
      ref={ref}
      transition={{
        layout: {
          duration: 0.22,
          ease: [0.77, 0, 0.175, 1],
        },
      }}
    >
      <motion.div
        animate={{ opacity: 1, transform: restingTransform }}
        exit={{
          opacity: 0,
          transform: reduceMotion ? restingTransform : "translateY(-6px)",
          transition: {
            duration: reduceMotion ? 0.1 : 0.14,
            ease: [0.23, 1, 0.32, 1],
          },
        }}
        initial={
          enter
            ? {
                opacity: 0,
                transform: reduceMotion ? restingTransform : "translateY(12px)",
              }
            : false
        }
        transition={{
          delay: reduceMotion ? 0 : delay,
          duration: reduceMotion ? 0.14 : 0.28,
          ease: [0.23, 1, 0.32, 1],
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
});

function Welcome({
  composerValue,
  disabled,
  onComposerChange,
  onSubmit,
  onSuggestion,
  principalName,
  voice,
}: {
  composerValue: string;
  disabled: boolean;
  onComposerChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onSuggestion: (value: string) => void;
  principalName: string;
  voice: ReturnType<typeof useRealtimeVoice>;
}) {
  const firstName = principalName.split(/\s+/)[0];

  return (
    <div className="my-0 flex min-h-0 w-full flex-col justify-center py-0 sm:my-auto sm:min-h-[34rem] sm:py-12">
      <p className="mb-5 font-mono text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        New trip <span aria-hidden="true">·</span> TravelBot
      </p>
      <h1 className="max-w-2xl text-[2.35rem] leading-[0.98] font-semibold tracking-[-0.05em] text-foreground [font-family:var(--font-display)] sm:text-[2.85rem] md:max-w-none md:text-[3.05rem]">
        Where are we going, {firstName}?
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
        Tell me where you want to go, when, and what matters most. I’ll compare the best routes and build a plan for your approval.
      </p>

      <PromptInput
        className="mt-7 [&_[data-slot=input-group]]:rounded-2xl [&_[data-slot=input-group]]:border-foreground/20 [&_[data-slot=input-group]]:bg-panel [&_[data-slot=input-group]]:shadow-[0_16px_45px_rgb(20_21_17/0.08)] [&_[data-slot=input-group]]:focus-within:border-blue-600/70 [&_[data-slot=input-group]]:focus-within:ring-blue-600/15"
        onSubmit={(message) => onSubmit(message.text)}
      >
        <PromptInputBody>
          <PromptInputTextarea
            className="min-h-28 px-5 pt-5 text-base leading-6 placeholder:text-muted-foreground/75 sm:text-[15px]"
            disabled={disabled}
            onChange={(event) => onComposerChange(event.currentTarget.value)}
            placeholder="Describe your trip — destination, dates, travelers, budget…"
            value={composerValue}
          />
        </PromptInputBody>
        <PromptInputFooter className="border-t border-border/70 px-4 py-3">
          <PromptInputTools>
            <Button
              aria-label={voice.active ? "End voice conversation" : voice.supported ? "Start voice conversation" : "Voice mode is not supported in this browser"}
              aria-pressed={voice.active}
              className={cn("rounded-md", voice.active && "bg-red-50 text-destructive hover:bg-red-100")}
              disabled={!voice.supported || (disabled && !voice.active)}
              onClick={voice.toggle}
              size="icon-sm"
              title={voice.supported ? voice.label : "Your browser does not support realtime voice"}
              type="button"
              variant="ghost"
            >
              {voice.active ? <SquareIcon className="size-3.5 fill-current" /> : voice.supported ? <MicIcon /> : <MicOffIcon />}
            </Button>
            {voice.active ? <span className="hidden items-center gap-1.5 text-[10px] text-destructive sm:inline-flex"><i className="size-1.5 animate-pulse rounded-full bg-current" />{voice.label}</span> : null}
          </PromptInputTools>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:inline-flex">
              <i className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
              Google Flights ready
            </span>
            <PromptInputSubmit
              className="size-10 rounded-full bg-blue-700 text-white hover:bg-blue-800"
              disabled={!composerValue.trim() || disabled}
              status="ready"
            >
              <ArrowUpIcon className="size-4" />
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>

      <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground sm:text-xs">
        <ShieldCheckIcon className="size-4 shrink-0 text-foreground/70" />
        <span>Nothing is booked or paid without your confirmation.</span>
      </div>

      <div className="mt-7 grid gap-2.5 sm:grid-cols-3">
        {STARTER_PROMPTS.map((suggestion) => {
          const StarterIcon = suggestion.icon;
          return (
            <Button
              className="group h-auto min-h-[4.75rem] w-full justify-start gap-3 whitespace-normal rounded-xl border-foreground/15 bg-panel/55 px-3.5 py-3 text-left shadow-none transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 hover:border-foreground/25 hover:bg-panel motion-reduce:transform-none"
              disabled={disabled}
              key={suggestion.title}
              onClick={() => onSuggestion(suggestion.prompt)}
              variant="outline"
            >
              <StarterIcon className="size-4.5 shrink-0 text-foreground/75" strokeWidth={1.7} />
              <span className="min-w-0 flex-1">
                <strong className="block text-xs font-semibold text-foreground">{suggestion.title}</strong>
                <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">{suggestion.description}</span>
              </span>
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" />
            </Button>
          );
        })}
      </div>
      <p className={cn("mt-3 min-h-4 text-center text-[10px]", voice.error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
        {voice.error ?? (voice.active ? `${voice.label}. AI-generated voice.` : voice.supported ? "Start voice mode for a hands-free conversation." : "Enter sends · Shift+Enter adds a new line")}
      </p>
    </div>
  );
}

function TripDetail({
  className,
  complete,
  label,
  value,
}: {
  className?: string;
  complete: boolean;
  label: string;
  value?: string;
}) {
  return (
    <div className={cn("min-w-0 px-3.5 py-3", className)}>
      <dt className="flex items-center gap-1.5 text-[9px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {complete
          ? <CheckIcon aria-hidden="true" className="size-3 text-emerald-700" />
          : <CircleIcon aria-hidden="true" className="size-2.5 text-foreground/25" />}
        {label}
      </dt>
      <dd className={cn("mt-1 truncate text-xs font-semibold", !complete && "font-medium text-muted-foreground")}>{value ?? "Not set"}</dd>
    </div>
  );
}

function IntentSummary({
  conversation,
  onEdit,
}: {
  conversation: TravelBotConversation;
  onEdit: () => void;
}) {
  const { intent } = conversation;
  if (!intent.origin_iata && !intent.destination_iata && !intent.departure_date) return null;
  const capturedDetails = 6 - conversation.missing_fields.length;
  const summaryStatus = conversation.missing_fields.length
    ? `${capturedDetails} of 6 captured`
    : conversation.state === "AWAITING_AUTHORITY_CONFIRMATION"
      ? "Flight selected"
      : conversation.state === "COMPLETED"
        ? "Purchase completed"
        : "Ready to search";
  const missingLabel = conversation.missing_fields
    .map((field) => missingFieldLabels[field])
    .join(", ");

  return (
    <section className="overflow-hidden rounded-xl border border-foreground/12 bg-panel/75 shadow-[0_1px_0_rgb(20_21_17/0.025)]" aria-label="Current trip details">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-background text-blue-700 shadow-xs">
            <RouteIcon aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="panel-label">Trip brief</p>
            <h2 className="mt-0.5 truncate text-sm font-semibold tracking-[-0.015em]">Your trip so far</h2>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-medium", conversation.missing_fields.length ? "text-amber-700" : "text-emerald-700")}>
            <i aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {summaryStatus}
          </span>
          <button
            aria-label="Change trip details in chat"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onEdit}
            type="button"
          >
            <PencilIcon aria-hidden="true" className="size-3" />
            Change
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-2 border-t bg-background/45 sm:grid-cols-[1.35fr_1fr_.72fr_1fr_1fr]">
        <TripDetail
          className="col-span-2 sm:col-span-1"
          complete={Boolean(intent.origin_iata && intent.destination_iata)}
          label="Route"
          value={intent.origin_iata || intent.destination_iata ? `${intent.origin_iata ?? "Origin"} → ${intent.destination_iata ?? "Destination"}` : undefined}
        />
        <TripDetail className="border-t sm:border-t-0 sm:border-l" complete={Boolean(intent.departure_date)} label="Date" value={intent.departure_date ? formatLocalDate(intent.departure_date, intent.departure_date) : undefined} />
        <TripDetail className="border-t border-l" complete={Boolean(intent.passenger_count)} label="Travelers" value={intent.passenger_count ? String(intent.passenger_count) : undefined} />
        <TripDetail className="border-t sm:border-t-0 sm:border-l" complete={Boolean(intent.cabin)} label="Cabin" value={intent.cabin ? cabinLabel(intent.cabin) : undefined} />
        <TripDetail className="border-t border-l" complete={Boolean(intent.max_total_budget)} label="Total limit" value={intent.max_total_budget ? formatMoney(intent.max_total_budget.amount, intent.max_total_budget.currency) : undefined} />
      </dl>
      {conversation.missing_fields.length ? (
        <p className="flex items-start gap-2 border-t px-3.5 py-2.5 text-[10px] leading-4 text-muted-foreground">
          <ArrowRightIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-amber-700" />
          <span><strong className="font-medium text-foreground">Still needed:</strong> {missingLabel}.</span>
        </p>
      ) : null}
    </section>
  );
}

function WorkingStatus({ state }: { state: TravelBotState }) {
  const label = state === "AWAITING_OFFER_SELECTION"
    ? "Checking the selected flight"
    : state === "AWAITING_AUTHORITY_CONFIRMATION"
      ? "Securing your authorization"
      : "Searching flights and comparing options";

  return (
    <div
      aria-label={`TravelBot is working: ${label}`}
      aria-live="polite"
      className="flex min-h-[4.5rem] items-start gap-3"
      role="status"
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center text-blue-700">
        <BotIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <strong className="text-xs">TravelBot</strong>
          <span className="text-[10px] text-muted-foreground">working</span>
        </div>
        <div className="inline-flex min-h-9 max-w-full items-center gap-3 rounded-xl rounded-tl-sm border bg-panel/80 px-3.5 py-2 shadow-xs">
          <span aria-hidden="true" className="flex h-3 items-center gap-1">
            <i className="bound-typing-dot size-1.5 rounded-full bg-blue-600" />
            <i className="bound-typing-dot size-1.5 rounded-full bg-blue-600" />
            <i className="bound-typing-dot size-1.5 rounded-full bg-blue-600" />
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{label}</span>
        </div>
      </div>
    </div>
  );
}

function ApprovalCard({
  conversation,
  disabled,
  onDecision,
}: {
  conversation: TravelBotConversation;
  disabled: boolean;
  onDecision: (approved: boolean) => void;
}) {
  const approval = conversation.operation.pending_approval;
  if (!approval) return null;
  const offer = conversation.offers.find(({ offer_id: offerId }) => offerId === conversation.intent.selected_offer_id);
  const travelers = conversation.intent.passenger_count ?? 1;
  if (!offer) return null;
  const { fulfillment } = offer;
  const airline = fulfillment.airline_names?.join(" + ") ?? "Airline";
  const flightNumbers = fulfillment.flight_numbers?.join(" · ") ?? "Flight details at checkout";
  const originCity = airportCityLabels[fulfillment.origin];
  const destinationCity = airportCityLabels[fulfillment.destination];
  const sourceName = offer.source === "GOOGLE_FLIGHTS" ? "Google Flights" : "VuelaYa";
  const officialHref = officialFlightHref(offer);
  const officialLinkIsExternal = officialHref.startsWith("http");
  const selectionReason = [
    offer.ranking === "BEST" ? "Best match" : "Selected option",
    conversation.intent.max_total_budget ? `within ${formatMoneyCompact(conversation.intent.max_total_budget.amount, conversation.intent.max_total_budget.currency)} limit` : undefined,
  ].filter(Boolean).join(" · ");
  return (
    <div className="lg:-mx-6 xl:-mx-8">
      <article
        aria-label={`Purchase approval for ${fulfillment.origin} to ${fulfillment.destination}`}
        className="overflow-hidden rounded-[10px] border border-[#d8dadd] bg-[#fffefb]"
      >
        <div className="grid sm:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="flex min-w-0 flex-col" aria-labelledby="selected-flight-title">
            <header className="flex h-9 items-center bg-[#222326] px-4 text-[#f8f5ed] sm:px-6">
              <span className="font-mono text-[9px] font-semibold tracking-[0.14em] uppercase" id="selected-flight-title">Flight purchase ticket · Review</span>
            </header>

            <div className="flex flex-1 flex-col px-4 pt-4 pb-3.5 sm:px-6 sm:pt-5 sm:pb-4">
              <div className="grid grid-cols-3 items-center gap-3 font-mono text-[8px] font-semibold tracking-[0.1em] text-[#555b64] uppercase">
                <span>{airline}</span>
                <span className="text-center">Flight {flightNumbers}</span>
                <span className="text-right">{formatTicketDate(fulfillment.departure_local, fulfillment.departure_at)}</span>
              </div>

              <div className="mt-8 grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
                <div className="min-w-0">
                  <strong className="block text-[3.35rem] leading-[0.9] font-semibold tracking-[-0.07em] [font-family:var(--font-display)] sm:text-[3.8rem]">{fulfillment.origin}</strong>
                  {originCity ? <span className="mt-2 block text-[11px] font-medium text-[#555b64]">{originCity}</span> : null}
                </div>

                <div className="flex items-center" aria-hidden="true">
                  <i className="h-px flex-1 bg-[#aeb3ba]" />
                  <PlaneIcon className="mx-2 size-4 rotate-45 stroke-[1.6] text-[#34373d]" />
                  <i className="h-px flex-1 bg-[#aeb3ba]" />
                </div>

                <div className="min-w-0 text-right">
                  <strong className="block text-[3.35rem] leading-[0.9] font-semibold tracking-[-0.07em] [font-family:var(--font-display)] sm:text-[3.8rem]">{fulfillment.destination}</strong>
                  {destinationCity ? <span className="mt-2 block text-[11px] font-medium text-[#555b64]">{destinationCity}</span> : null}
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 border-y border-[#d9dadd] sm:grid-cols-4 sm:divide-x sm:divide-[#d9dadd]">
                <div className="border-b border-[#d9dadd] py-4 pr-3 sm:border-b-0">
                  <dt className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#777b82] uppercase">Departs</dt>
                  <dd className="mt-1 text-[0.9rem] font-semibold tabular-nums [font-family:var(--font-display)]">{formatLocalTime(fulfillment.departure_local, fulfillment.departure_at)}</dd>
                </div>
                <div className="border-b border-l border-[#d9dadd] py-4 pl-3 sm:border-b-0 sm:px-3">
                  <dt className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#777b82] uppercase">Arrives</dt>
                  <dd className="mt-1 text-[0.9rem] font-semibold tabular-nums [font-family:var(--font-display)]">{formatLocalTime(fulfillment.arrival_local, fulfillment.arrival_at)}</dd>
                </div>
                <div className="py-4 pr-3 sm:px-3">
                  <dt className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#777b82] uppercase">Duration</dt>
                  <dd className="mt-1 text-[0.9rem] font-semibold tabular-nums [font-family:var(--font-display)]">{formatTicketDuration(fulfillment.duration_minutes) ?? "Pending"}</dd>
                </div>
                <div className="border-l border-[#d9dadd] py-4 pl-3">
                  <dt className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#777b82] uppercase">Stops</dt>
                  <dd className="mt-1 text-[0.9rem] font-semibold uppercase [font-family:var(--font-display)]">{stopLabel(fulfillment.stops) ?? "Pending"}</dd>
                </div>
              </dl>

              <dl className="grid grid-cols-2 gap-x-3 border-b border-[#d9dadd] sm:grid-cols-[5.5rem_6.5rem_minmax(0,1fr)]">
                <div className="py-4">
                  <dt className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#777b82] uppercase">Traveler</dt>
                  <dd className="mt-1 text-[11px] font-semibold">{travelers}</dd>
                </div>
                <div className="py-4">
                  <dt className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#777b82] uppercase">Class</dt>
                  <dd className="mt-1 text-[11px] font-semibold uppercase">{cabinLabel(fulfillment.cabin)}</dd>
                </div>
                <div className="col-span-2 flex items-center gap-2 border-t border-[#d9dadd] py-4 text-[9px] font-semibold tracking-[0.02em] text-emerald-800 uppercase sm:col-span-1 sm:border-t-0 sm:pl-2">
                  <span className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-800 text-white"><CheckIcon className="size-2.5 stroke-[3]" /></span>
                  {selectionReason}
                </div>
              </dl>

              <div className="grid min-h-[4.75rem] grid-cols-2 items-center gap-5 py-3 text-[9px] leading-[1.45] text-[#777b82]">
                <p>{fulfillment.departure_airport_name ?? "Departure airport"} ({fulfillment.origin})</p>
                <p className="text-right">{fulfillment.arrival_airport_name ?? "Arrival airport"} ({fulfillment.destination})</p>
              </div>

              <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#d9dadd] pt-3 text-[9px] text-[#777b82]">
                <span>Fare checked {freshnessLabel(offer.observed_at)}</span>
                {offer.source === "GOOGLE_FLIGHTS" ? (
                  <Link
                    className="inline-flex items-center gap-1 font-medium hover:text-foreground hover:underline"
                    href={officialHref}
                    {...(officialLinkIsExternal ? { rel: "noreferrer", target: "_blank" } : {})}
                  >
                    {sourceName}<ExternalLinkIcon className="size-3" />
                  </Link>
                ) : <span>{sourceName}</span>}
              </footer>
            </div>
          </section>

          <aside className="relative flex min-w-0 flex-col border-t border-dashed border-[#aeb4bd] bg-[#f5f7fa] sm:border-t-0 sm:border-l" aria-labelledby="purchase-approval-title">
            <header className="flex h-9 items-center bg-[#222326] px-5 text-[#f8f5ed]">
              <span className="font-mono text-[9px] font-semibold tracking-[0.14em] uppercase">One-time authority</span>
            </header>

            <div className="flex flex-1 flex-col px-5 pt-4">
              <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3 border-b border-[#d3d6db] pb-3">
                <div>
                  <strong className="block text-xl leading-none font-semibold tracking-[-0.04em] [font-family:var(--font-display)]">{fulfillment.origin} <ArrowRightIcon className="inline size-3.5" /> {fulfillment.destination}</strong>
                  <span className="mt-1.5 block font-mono text-[8px] tracking-[0.08em] text-[#73777e] uppercase">Flight route</span>
                </div>
                <div className="text-right">
                  <strong className="block text-[10px] font-semibold">{formatTicketShortDate(fulfillment.departure_local, fulfillment.departure_at)}</strong>
                  <span className="mt-1 block font-mono text-[7px] tracking-[0.08em] text-[#73777e] uppercase">Date</span>
                </div>
                <div className="text-right">
                  <strong className="block text-[10px] font-semibold">{flightNumbers}</strong>
                  <span className="mt-1 block font-mono text-[7px] tracking-[0.08em] text-[#73777e] uppercase">Flight</span>
                </div>
              </div>

              <p className="mt-4 font-mono text-[8px] font-semibold tracking-[0.12em] text-[#73777e] uppercase">Purchase approval</p>
              <h2 className="mt-2 text-[1.5rem] leading-[1.08] font-semibold tracking-[-0.045em] [font-family:var(--font-display)] sm:whitespace-nowrap" id="purchase-approval-title">Authorize this flight?</h2>
              <strong className="mt-4 block text-[2.75rem] leading-none font-semibold tracking-[-0.06em] tabular-nums [font-family:var(--font-display)]">{formatMoney(approval.amount, approval.currency)}</strong>
              <span className="mt-2 font-mono text-[8px] font-semibold tracking-[0.1em] text-[#73777e] uppercase">Total to VuelaYa</span>

              <div className="mt-5 grid gap-2">
                <Button className="h-11 w-full rounded-md" disabled={disabled} onClick={() => onDecision(true)}>
                  {disabled ? (
                    <>
                      <span aria-hidden="true" className="flex h-3 items-center gap-1">
                        <i className="bound-typing-dot size-1 rounded-full bg-current" />
                        <i className="bound-typing-dot size-1 rounded-full bg-current" />
                        <i className="bound-typing-dot size-1 rounded-full bg-current" />
                      </span>
                      Processing securely
                    </>
                  ) : (
                    <><FingerprintIcon />Confirm with selfie</>
                  )}
                </Button>
                <Button className="h-11 w-full rounded-md border-[#cfd3d9] bg-[#fffefb]" disabled={disabled} onClick={() => onDecision(false)} variant="outline">Not now</Button>
              </div>

              <p className="mt-4 flex items-start gap-2 text-[9px] leading-4 text-[#686d75]"><ShieldCheckIcon className="mt-0.5 size-3 shrink-0" />Your live selfie is matched to the approved onboarding before this exact authority becomes active.</p>

              <details className="group -mx-5 mt-auto border-t border-[#d3d6db]">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
                  <span><strong className="block text-[10px]">Authority details</strong><span className="mt-0.5 block text-[9px] leading-4 text-[#73777e]">Only this flight, merchant, and amount</span></span>
                  <ChevronRightIcon className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-90" />
                </summary>
                <dl className="grid gap-2 border-t border-[#d3d6db] bg-white/70 px-5 py-3 text-[9px]">
                  <div><dt className="text-muted-foreground">Recipient</dt><dd className="mt-0.5 break-all font-mono">{approval.merchant_id}</dd></div>
                  <div><dt className="text-muted-foreground">One-time mandate</dt><dd className="mt-0.5 break-all font-mono">{shortId(approval.mandate_id, 12, 8)}</dd></div>
                </dl>
              </details>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}

const auditEventContent: Record<string, { title: string; detail: string }> = {
  "mandate.created": { title: "Authority recorded", detail: "The one-time spending terms were stored." },
  "mandate.activated": { title: "Authority activated", detail: "The principal's signed mandate became valid." },
  "authorization.reserved": { title: "Purchase allowed", detail: "Jaguary verified the flight, merchant, and amount." },
  "payment.attempt_started": { title: "Payment initiated", detail: "The approved amount was sent for processing." },
  "payment.approved": { title: "Payment approved", detail: "The provider returned a successful result." },
  "order.confirmed": { title: "Order and receipt issued", detail: "VuelaYa confirmed the purchase and Jaguary saved the record." },
};

function auditLabel(event: AuditTimelineEvent) {
  return auditEventContent[event.event_type] ?? {
    title: event.event_type.split(".").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" · "),
    detail: "Recorded in the Jaguary audit ledger.",
  };
}

type PurchaseEvidence = {
  receipt?: OrderReceipt;
  timeline?: AuditTimeline;
  error?: string;
};

const purchaseEvidenceRequests = new Map<string, Promise<PurchaseEvidence>>();

function loadPurchaseEvidence(receiptId: string, correlationId?: string) {
  const key = `${receiptId}:${correlationId ?? "receipt"}`;
  const cached = purchaseEvidenceRequests.get(key);
  if (cached) return cached;
  const request = (async () => {
    const receiptResult = await boundApi.getReceipt(receiptId).catch(() => undefined);
    const receipt = receiptResult?.data;
    const resolvedCorrelationId = correlationId ?? receipt?.evidence.correlation_id;
    const timelineResult = resolvedCorrelationId
      ? await boundApi.getAuditTimeline(resolvedCorrelationId).catch(() => undefined)
      : undefined;
    const timeline = timelineResult?.data;
    return {
      receipt,
      timeline,
      error: receipt && timeline ? undefined : "Some audit evidence could not be loaded. The saved receipt remains available.",
    };
  })();
  purchaseEvidenceRequests.set(key, request);
  return request;
}

function PurchaseReceipt({ conversation, watch }: { conversation?: TravelBotConversation; watch?: TravelWatch }) {
  const reduceMotion = useReducedMotion();
  const completed = watch ? watch.status === "COMPLETED" : conversation?.state === "COMPLETED";
  const receiptId = watch?.receipt_id ?? conversation?.operation.receipt_id;
  const auditCorrelationId = conversation?.messages.filter(({ role }) => role === "USER").at(-1)?.correlation_id;
  const [evidence, setEvidence] = useState<{
    key?: string;
    receipt?: OrderReceipt;
    timeline?: AuditTimeline;
    error?: string;
  }>({});
  const expectedEvidenceKey = receiptId ? `${receiptId}:${auditCorrelationId ?? "receipt"}` : undefined;
  const evidenceLoading = Boolean(expectedEvidenceKey && evidence.key !== expectedEvidenceKey);
  const currentEvidence = evidence.key === expectedEvidenceKey ? evidence : {};

  useEffect(() => {
    if (!completed || !receiptId) return;
    const completedReceiptId = receiptId;
    const key = `${completedReceiptId}:${auditCorrelationId ?? "receipt"}`;
    let cancelled = false;
    void loadPurchaseEvidence(completedReceiptId, auditCorrelationId).then((result) => {
      if (!cancelled) setEvidence({ key, ...result });
    });
    return () => { cancelled = true; };
  }, [auditCorrelationId, completed, receiptId]);

  if (!completed || !receiptId) return null;
  const offer = watch?.matched_offer
    ?? conversation?.offers.find(({ offer_id: offerId }) => offerId === conversation.intent.selected_offer_id);
  if (!offer) return null;
  const receipt = currentEvidence.receipt;
  const fulfillment = receipt?.fulfillment ?? offer.fulfillment;
  const travelers = watch?.criteria.passenger_count ?? conversation?.intent.passenger_count ?? 1;
  const total = receipt?.total ?? { amount: offer.total.amount * travelers, currency: offer.total.currency };
  const events = currentEvidence.timeline?.events.filter(({ event_type: type }) => type !== "agent.registered") ?? [];
  const lastEvent = events.at(-1);
  const originCity = airportCityLabels[fulfillment.origin];
  const destinationCity = airportCityLabels[fulfillment.destination];

  return (
    <article className="overflow-hidden rounded-[10px] border border-[#d4d9d6] bg-[#fffefb] lg:-mx-6 xl:-mx-8" aria-label="Purchase confirmed">
      <header className="flex min-h-10 items-center justify-between gap-3 bg-[#202326] px-4 py-2 text-[#f8f5ed] sm:px-6">
        <span className="font-mono text-[9px] font-semibold tracking-[0.14em] uppercase">Jaguary purchase receipt</span>
        <span className="inline-flex items-center gap-2 font-mono text-[8px] font-semibold tracking-[0.12em] text-[#8de0b7] uppercase"><CheckCheckIcon className="size-3.5" />Paid · Recorded</span>
      </header>

      <div className="px-4 pt-5 sm:px-6 sm:pt-6">
        <section className="grid gap-5 border-b border-[#d9dcda] pb-5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end" aria-labelledby="purchase-confirmed-title">
          <div className="min-w-0">
            <p className="font-mono text-[8px] font-semibold tracking-[0.12em] text-emerald-800 uppercase">Purchase confirmed</p>
            <h2 className="mt-2 text-[2.65rem] leading-none font-semibold tracking-[-0.065em] [font-family:var(--font-display)]" id="purchase-confirmed-title">{fulfillment.origin} <ArrowRightIcon className="mx-1 inline size-6 stroke-[1.7]" /> {fulfillment.destination}</h2>
            <p className="mt-3 text-[11px] text-[#656a70]">{fulfillment.airline_names?.join(" + ") ?? "Airline"} · {fulfillment.flight_numbers?.join(" · ") ?? "Flight confirmed"} · {formatTicketDate(fulfillment.departure_local, fulfillment.departure_at)}</p>
          </div>
          <div className="border-l-2 border-emerald-700 pl-4 sm:text-right">
            <span className="block font-mono text-[8px] font-semibold tracking-[0.12em] text-[#70757c] uppercase">Total paid to VuelaYa</span>
            <strong className="mt-2 block text-[2.35rem] leading-none font-semibold tracking-[-0.055em] tabular-nums [font-family:var(--font-display)]">{formatMoney(total.amount, total.currency)}</strong>
            <span className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-medium text-emerald-800"><ShieldCheckIcon className="size-3" />Payment approved</span>
          </div>
        </section>

        <section className="py-5" aria-labelledby="confirmed-itinerary-title">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#70757c] uppercase" id="confirmed-itinerary-title">Confirmed itinerary · Local times</h3>
            <span className="font-mono text-[8px] tracking-[0.08em] text-[#70757c] uppercase">One way</span>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]">
            <div className="min-w-0">
              <strong className="block text-[1.85rem] leading-none font-semibold tracking-[-0.04em] tabular-nums [font-family:var(--font-display)]">{formatLocalTime(fulfillment.departure_local, fulfillment.departure_at)}</strong>
              <span className="mt-2 block text-sm font-semibold">{fulfillment.origin}</span>
              <span className="mt-1 block text-[9px] text-[#777b82]">{originCity ?? fulfillment.departure_airport_name ?? "Departure airport"}</span>
            </div>
            <div className="text-center">
              <span className="block font-mono text-[8px] text-[#70757c] uppercase">{formatTicketDuration(fulfillment.duration_minutes) ?? "Pending"}</span>
              <span className="my-2 flex items-center" aria-hidden="true"><i className="h-px flex-1 bg-[#b8bdc2]" /><PlaneIcon className="mx-2 size-3.5 rotate-45 stroke-[1.6]" /><i className="h-px flex-1 bg-[#b8bdc2]" /></span>
              <span className="block font-mono text-[8px] text-[#70757c] uppercase">{stopLabel(fulfillment.stops) ?? "Stops pending"}</span>
            </div>
            <div className="min-w-0 text-right">
              <strong className="block text-[1.85rem] leading-none font-semibold tracking-[-0.04em] tabular-nums [font-family:var(--font-display)]">{formatLocalTime(fulfillment.arrival_local, fulfillment.arrival_at)}</strong>
              <span className="mt-2 block text-sm font-semibold">{fulfillment.destination}</span>
              <span className="mt-1 block text-[9px] text-[#777b82]">{destinationCity ?? fulfillment.arrival_airport_name ?? "Arrival airport"}</span>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 border-y border-[#d9dcda] py-3 text-[9px]">
            <div><dt className="font-mono text-[7px] tracking-[0.1em] text-[#777b82] uppercase">Traveler</dt><dd className="mt-1 font-semibold">{travelers}</dd></div>
            <div className="border-l border-[#d9dcda] px-3"><dt className="font-mono text-[7px] tracking-[0.1em] text-[#777b82] uppercase">Class</dt><dd className="mt-1 font-semibold uppercase">{cabinLabel(fulfillment.cabin)}</dd></div>
            <div className="border-l border-[#d9dcda] pl-3"><dt className="font-mono text-[7px] tracking-[0.1em] text-[#777b82] uppercase">Date</dt><dd className="mt-1 font-semibold">{formatTicketShortDate(fulfillment.departure_local, fulfillment.departure_at)}</dd></div>
          </dl>
        </section>

        <section className="border-y border-[#d9dcda] py-4" aria-labelledby="payment-record-title">
          <div className="flex items-end justify-between gap-3">
            <div><p className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#70757c] uppercase">Payment record</p><h3 className="mt-1 text-sm font-semibold" id="payment-record-title">Charge details</h3></div>
            {receipt?.issued_at ? <time className="text-[9px] text-[#777b82]" dateTime={receipt.issued_at}>{formatDateTime(receipt.issued_at)}</time> : null}
          </div>
          <dl className="mt-3 grid grid-cols-2 text-[10px] sm:grid-cols-4 sm:divide-x sm:divide-[#d9dcda]">
            <div className="pb-3 sm:pb-0 sm:pr-3"><dt className="text-[#777b82]">Merchant</dt><dd className="mt-1 font-semibold">VuelaYa</dd></div>
            <div className="border-l border-[#d9dcda] pb-3 pl-3 sm:border-l-0 sm:pb-0"><dt className="text-[#777b82]">Status</dt><dd className="mt-1 font-semibold text-emerald-800">{receipt?.status ?? "CONFIRMED"}</dd></div>
            <div className="border-t border-[#d9dcda] pt-3 sm:border-t-0 sm:px-3 sm:pt-0"><dt className="text-[#777b82]">Payment</dt><dd className="mt-1 truncate font-mono text-[9px]" title={receipt?.payment_id}>{receipt ? shortId(receipt.payment_id, 9, 5) : "Loading…"}</dd></div>
            <div className="border-t border-l border-[#d9dcda] pt-3 pl-3 sm:border-t-0 sm:border-l-0 sm:pt-0"><dt className="text-[#777b82]">Order</dt><dd className="mt-1 truncate font-mono text-[9px]" title={receipt?.order_id}>{receipt ? shortId(receipt.order_id, 9, 5) : "Loading…"}</dd></div>
          </dl>
        </section>

        <section className="relative -mx-4 border-b border-[#d9dcda] bg-[#f3f7f4] px-4 py-5 sm:-mx-6 sm:px-6" aria-labelledby="audit-trail-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="font-mono text-[8px] font-semibold tracking-[0.12em] text-emerald-800 uppercase">Jaguary audit</p><h3 className="mt-1 text-base font-semibold" id="audit-trail-title">Authorization path</h3></div>
            {currentEvidence.timeline ? <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold text-emerald-800"><FingerprintIcon className="size-3.5" />{events.length} checks · Chain validated</span> : null}
          </div>

          <AnimatePresence initial={false} mode="popLayout">
            {evidenceLoading ? (
              <motion.div
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                aria-live="polite"
                className="mt-4 min-h-[28rem] sm:min-h-48"
                exit={{ opacity: 0, transform: reduceMotion ? "translateY(0px)" : "translateY(-3px)" }}
                key="evidence-loading"
                transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: [0.23, 1, 0.32, 1] }}
              >
                <Shimmer className="text-xs text-[#68716b]">Loading the signed receipt and audit trail…</Shimmer>
                <div className="mt-4 grid gap-4 sm:grid-cols-2"><i className="h-14 animate-pulse border-t border-emerald-200" /><i className="h-14 animate-pulse border-t border-emerald-200" /><i className="h-14 animate-pulse border-t border-emerald-200" /><i className="h-14 animate-pulse border-t border-emerald-200" /></div>
              </motion.div>
            ) : events.length ? (
              <motion.ol
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2"
                initial={{ opacity: 0, transform: reduceMotion ? "translateY(0px)" : "translateY(4px)" }}
                key="evidence-ready"
                transition={{ duration: reduceMotion ? 0.08 : 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                {events.map((event) => {
                  const content = auditLabel(event);
                  return (
                    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-2.5 border-t border-emerald-200 pt-3" key={event.event_id}>
                      <span className="mt-0.5 grid size-[1.125rem] place-items-center rounded-full bg-emerald-800 text-white"><CheckIcon className="size-2.5 stroke-[3]" /></span>
                      <div className="min-w-0"><strong className="block text-[11px]">{content.title}</strong><p className="mt-0.5 text-[9px] leading-4 text-[#68716b]">{content.detail}</p></div>
                      <time className="font-mono text-[8px] text-[#68716b]" dateTime={event.recorded_at}>{formatTime(event.recorded_at)}</time>
                    </li>
                  );
                })}
              </motion.ol>
            ) : (
              <motion.p
                animate={{ opacity: 1 }}
                className="mt-4 text-xs text-[#68716b]"
                initial={{ opacity: 0 }}
                key="evidence-unavailable"
                transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              >
                The receipt is saved; its detailed audit trail is not available in this view.
              </motion.p>
            )}
          </AnimatePresence>

          {currentEvidence.error ? <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-4 text-amber-800"><CircleAlertIcon className="mt-0.5 size-3 shrink-0" />{currentEvidence.error}</p> : null}
        </section>

        <details className="group border-b border-[#d9dcda]">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring">
            <span className="inline-flex items-center gap-2"><FingerprintIcon className="size-3.5 text-emerald-800" />Cryptographic evidence</span>
            <span className="inline-flex items-center gap-2 font-mono text-[8px] font-normal tracking-[0.08em] text-[#70757c]">HASH-LINKED<ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" /></span>
          </summary>
          <dl className="grid gap-3 border-t border-[#d9dcda] bg-[#f7f8f7] p-4 text-[9px] sm:grid-cols-2">
            <div><dt className="text-[#777b82]">Receipt</dt><dd className="mt-0.5 break-all font-mono">{receiptId}</dd></div>
            <div><dt className="text-[#777b82]">Correlation</dt><dd className="mt-0.5 break-all font-mono">{currentEvidence.timeline?.correlation_id ?? receipt?.evidence.correlation_id ?? auditCorrelationId ?? "Unavailable"}</dd></div>
            <div><dt className="text-[#777b82]">Receipt evidence hash</dt><dd className="mt-0.5 break-all font-mono">{receipt?.evidence.event_hash ?? "Loading…"}</dd></div>
            <div><dt className="text-[#777b82]">Latest chain hash</dt><dd className="mt-0.5 break-all font-mono">{lastEvent?.event_hash ?? "Loading…"}</dd></div>
          </dl>
        </details>

        <footer className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-[9px] leading-4 text-[#777b82]"><InfoIcon className="mt-0.5 size-3 shrink-0" />Trip receipt only · not a boarding pass.</p>
          <div className="flex gap-2">
            <Button className="h-11 flex-1 rounded-md sm:flex-none" onClick={() => void navigator.clipboard.writeText(receiptId)} variant="outline"><CopyIcon />Copy receipt ID</Button>
            <Button className="h-11 flex-1 rounded-md sm:flex-none" nativeButton={false} render={<Link href="/purchases" />} variant="outline"><ReceiptTextIcon />Purchases</Button>
          </div>
        </footer>
      </div>
    </article>
  );
}

function AuthoritySurface({
  conversation,
  disabled,
  onDecision,
}: {
  conversation: TravelBotConversation;
  disabled: boolean;
  onDecision: (approved: boolean) => void;
}) {
  const { scrollRef, stopScroll } = useStickToBottomContext();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const anchorTopRef = useRef<number | undefined>(undefined);
  const showApproval = conversation.state === "AWAITING_AUTHORITY_CONFIRMATION" && Boolean(conversation.operation.pending_approval);

  const handleDecision = useCallback((approved: boolean) => {
    anchorTopRef.current = surfaceRef.current?.getBoundingClientRect().top;
    stopScroll();
    onDecision(approved);
  }, [onDecision, stopScroll]);

  useLayoutEffect(() => {
    const anchorTop = anchorTopRef.current;
    const surface = surfaceRef.current;
    const scroll = scrollRef.current;
    if (anchorTop === undefined || !surface || !scroll) return;

    const offset = surface.getBoundingClientRect().top - anchorTop;
    if (Math.abs(offset) > 0.5) {
      scroll.scrollTop += offset;
    }
    stopScroll();
  }, [conversation.messages.length, conversation.operation.receipt_id, conversation.state, scrollRef, stopScroll]);

  return (
    <div className="relative" ref={surfaceRef}>
      <AnimatePresence initial={false} mode="popLayout">
        {showApproval ? (
          <ChatPresenceItem key="approval-card">
            <ApprovalCard conversation={conversation} disabled={disabled} onDecision={handleDecision} />
          </ChatPresenceItem>
        ) : conversation.state === "COMPLETED" ? (
          <ChatPresenceItem delay={0.06} key={`receipt-${conversation.operation.receipt_id ?? "pending"}`}>
            <PurchaseReceipt conversation={conversation} />
          </ChatPresenceItem>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const watchStatusCopy: Record<TravelWatch["status"], { label: string; title: string; detail: string }> = {
  AWAITING_LIVENESS: { label: "One step left", title: "Confirm once to start watching", detail: "Take a live selfie now to approve these exact trip details. You will not need another selfie when it is time to buy." },
  ACTIVE: { label: "Watching prices", title: "We’re looking for the right fare", detail: "Jaguary is checking in the background and will buy only when every detail below matches." },
  CHECKING: { label: "Checking now", title: "Comparing current fares", detail: "We’re checking the latest flights against your route, date and maximum total price." },
  MATCHED: { label: "Match found", title: "A fare matches your request", detail: "We found an eligible flight and are completing the final safety checks before payment." },
  EXECUTING: { label: "Buying now", title: "Completing your purchase", detail: "The flight passed every check. Jaguary is paying with the approval you already gave." },
  COMPLETED: { label: "Purchased", title: "Your flight was purchased", detail: "A fare matched every detail and the single approved purchase is complete." },
  EXPIRED: { label: "Ended", title: "The price watch has ended", detail: "No matching fare appeared before your approved travel window ended." },
  CANCELLED: { label: "Cancelled", title: "The price watch is off", detail: "Jaguary has stopped checking and cannot make this purchase." },
  FAILED: { label: "Needs attention", title: "The price watch stopped", detail: "We could not continue after a flight provider or purchase error. You can safely start a new watch." },
};

function TravelWatchCard({ conversation, watch, disabled, simulationMessage, simulationRunning, onCreate, onAuthorize, onCancel, onSimulate }: {
  conversation: TravelBotConversation;
  watch: TravelWatch | null;
  disabled: boolean;
  simulationMessage?: string;
  simulationRunning: boolean;
  onCreate: () => void;
  onAuthorize: (watch: TravelWatch) => void;
  onCancel: (watch: TravelWatch) => void;
  onSimulate: (watch: TravelWatch) => void;
}) {
  const criteria = watch?.criteria ?? conversation.intent;
  const budget = criteria.max_total_budget;
  const copy = watch ? watchStatusCopy[watch.status] : {
    label: "No matching fare right now",
    title: "Want Jaguary to keep looking?",
    detail: "Approve your trip and maximum price once. We’ll check in the background and buy automatically only when a flight matches every detail.",
  };
  const running = Boolean(watch && ["ACTIVE", "CHECKING", "MATCHED", "EXECUTING"].includes(watch.status));
  const canRestart = Boolean(watch && ["CANCELLED", "EXPIRED", "FAILED"].includes(watch.status));
  const completed = watch?.status === "COMPLETED";
  const departure = criteria.departure_date
    ? formatLocalDate(criteria.departure_date, criteria.departure_date)
    : "Date not set";
  const travelerLabel = criteria.passenger_count === 1 ? "1 traveler" : `${criteria.passenger_count ?? "—"} travelers`;
  const statusTone = completed
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : watch?.status === "FAILED"
      ? "border-red-200 bg-red-50 text-red-800"
      : watch && ["MATCHED", "EXECUTING"].includes(watch.status)
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_55px_-42px_rgb(15_23_42/0.55)] lg:-mx-6 xl:-mx-8" aria-label="Automatic flight price watch" aria-live="polite">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <header className="flex items-start gap-3.5">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg border", statusTone)} aria-hidden="true">
            {completed ? <CheckIcon className="size-5 stroke-[2.5]" /> : <RefreshCwIcon className={cn("size-4.5", running && "motion-safe:animate-spin")} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Price watch</p>
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusTone)}>{copy.label}</span>
              <span className="text-[10px] font-medium text-slate-500">One purchase only</span>
            </div>
            <h2 className="mt-2 text-[22px] leading-7 font-semibold tracking-[-0.035em] text-slate-950 [font-family:var(--font-display)] sm:text-2xl">{copy.title}</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-5 text-slate-600">{copy.detail}</p>
          </div>
        </header>

        <section className="mt-5 grid overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 sm:grid-cols-[minmax(0,1fr)_13.5rem]" aria-label="Approved trip details">
          <div className="p-4 sm:p-5">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">Your trip</p>
            <div className="mt-2 flex items-center gap-3 text-xl font-semibold tracking-[-0.02em] text-slate-950 sm:text-2xl">
              <span>{criteria.origin_iata ?? "—"}</span>
              <span className="flex min-w-12 flex-1 items-center text-slate-400" aria-hidden="true"><i className="h-px flex-1 bg-slate-300" /><PlaneIcon className="mx-2 size-4 rotate-45 stroke-[1.7]" /><i className="h-px flex-1 bg-slate-300" /></span>
              <span>{criteria.destination_iata ?? "—"}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{departure} · {travelerLabel} · {criteria.cabin ? cabinLabel(criteria.cabin) : "Cabin not set"}</p>
          </div>
          <div className="border-t border-slate-200 bg-white p-4 sm:border-t-0 sm:border-l sm:p-5">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-slate-500 uppercase">Buy only at or below</p>
            <strong className="mt-2 block text-2xl tracking-[-0.03em] text-slate-950 tabular-nums">{budget ? formatMoneyCompact(budget.amount, budget.currency) : "—"}</strong>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Total for all travelers</p>
          </div>
        </section>

        <ol className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="How automatic purchase works">
          {[
            { number: "1", title: "Approve once", detail: "Confirm these exact details" },
            { number: "2", title: "We check prices", detail: "Jaguary keeps looking" },
            { number: "3", title: "We buy the match", detail: "No second selfie needed" },
          ].map((step) => (
            <li className="flex gap-3 rounded-lg border border-slate-200 px-3 py-3" key={step.number}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">{step.number}</span>
              <span><strong className="block text-xs font-semibold text-slate-900">{step.title}</strong><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{step.detail}</span></span>
            </li>
          ))}
        </ol>

        {watch?.nearest_miss ? <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900"><InfoIcon className="mt-0.5 size-3.5 shrink-0" />Closest fare found: {formatMoneyCompact(watch.nearest_miss.party_total.amount, watch.nearest_miss.party_total.currency)} total. We did not buy it or change your limit.</p> : null}

        {SHOW_DEVELOPMENT_SIMULATOR && watch && ["ACTIVE", "CHECKING", "COMPLETED", "FAILED"].includes(watch.status) ? (
          <section className={cn(
            "mt-4 flex flex-col gap-3 rounded-lg border border-dashed px-3.5 py-3 sm:flex-row sm:items-center",
            watch.status === "COMPLETED" ? "border-emerald-300 bg-emerald-50/60" : "border-amber-300 bg-amber-50/60",
          )} aria-label="Development purchase simulator">
            <span className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg border bg-white",
              watch.status === "COMPLETED" ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700",
            )}><FlaskConicalIcon className="size-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-900">
                Test automatic purchase
                <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[8px] tracking-[0.08em] text-slate-500 uppercase">Development only</span>
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">
                {simulationMessage ?? "Create a one-time demo fare 10% below this approved limit. The regular worker, Verify, payment simulator and receipt flow will handle it."}
              </p>
            </div>
            {watch.status === "ACTIVE" ? (
              <Button className="shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100" disabled={disabled || simulationRunning} onClick={() => onSimulate(watch)} size="sm" variant="outline">
                <FlaskConicalIcon />{simulationRunning ? "Offer queued" : "Make fare appear"}
              </Button>
            ) : null}
          </section>
        ) : null}

        <footer className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] leading-4 text-slate-500">
            <p className="font-medium text-slate-700">Your maximum price never increases automatically.</p>
            {watch?.next_check_at ? <p className="mt-1">Next check {formatDateTime(watch.next_check_at)} · Checked {watch.attempt_count} times</p> : <p className="mt-1">You can cancel this price watch at any time.</p>}
            {watch?.receipt_id ? <p className="mt-1 font-mono text-emerald-800">Receipt {watch.receipt_id}</p> : null}
          </div>
          <div className="shrink-0 sm:min-w-56">
          {!watch || canRestart ? (
            <Button className="w-full" disabled={disabled} onClick={onCreate}><ShieldCheckIcon />Review automatic purchase</Button>
          ) : watch.status === "AWAITING_LIVENESS" ? (
            <Button className="w-full" disabled={disabled} onClick={() => onAuthorize(watch)}><FingerprintIcon />Verify & start watching</Button>
          ) : watch.status === "COMPLETED" ? (
            <Button className="w-full" nativeButton={false} render={<Link href="/purchases" />} variant="outline"><ReceiptTextIcon />View purchase</Button>
          ) : (
            <Button className="w-full" disabled={disabled} onClick={() => onCancel(watch)} variant="outline">Stop price watch</Button>
          )}
          </div>
        </footer>
      </div>
    </article>
  );
}

function ErrorNotice({ error, onRetry }: { error: BoundApiError; onRetry?: () => void }) {
  const needsIdentityVerification = error.code === "principal_attestation_required" || error.code === "agent_attestation_required";
  const title = error.code === "api_timeout"
    ? "Request taking longer"
    : error.offline
      ? "Jaguary API unavailable"
      : "Could not complete";
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-sm" role="alert">
      {error.offline ? <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div className="min-w-0 flex-1">
        <strong className="block text-xs">{title}</strong>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{error.message}</p>
        {error.correlationId ? <code className="mt-1 block break-all text-[10px] text-muted-foreground">{error.correlationId}</code> : null}
      </div>
      {needsIdentityVerification ? (
        <Button nativeButton={false} render={<Link href="/trust" />} size="sm" variant="outline"><FingerprintIcon />Verify my identity</Button>
      ) : onRetry ? <Button onClick={onRetry} size="sm" variant="outline"><RefreshCwIcon />Try again</Button> : null}
    </div>
  );
}

const watchProgressLabels: Record<TravelWatch["status"], string> = {
  AWAITING_LIVENESS: "Awaiting verification",
  ACTIVE: "Watching prices",
  CHECKING: "Checking fares",
  MATCHED: "Match found",
  EXECUTING: "Purchasing",
  COMPLETED: "Purchase complete",
  EXPIRED: "Watch expired",
  CANCELLED: "Watch cancelled",
  FAILED: "Watch needs attention",
};

function OperationInspector({ conversation, watch, busy }: { conversation?: TravelBotConversation; watch?: TravelWatch | null; busy: BusyState }) {
  const state = conversation?.state ?? "COLLECTING";
  const operation = conversation?.operation;
  const watchCompleted = watch?.status === "COMPLETED" && Boolean(watch.receipt_id);
  const watchAuthorized = Boolean(watch && ["ACTIVE", "CHECKING", "MATCHED", "EXECUTING", "COMPLETED"].includes(watch.status));
  const watchMatched = Boolean(watch?.matched_offer_id || watchCompleted);
  const steps = [
    { label: "Understand request", done: Boolean(conversation && conversation.missing_fields.length === 0) },
    { label: "Choose best flight", done: Boolean(conversation?.intent.selected_offer_id || watchMatched) },
    { label: "Lock checkout", done: Boolean(operation?.checkout_id || watchCompleted) },
    { label: "Obtain authority", done: Boolean(operation?.mandate_id || watchAuthorized) },
    { label: "Purchase and issue", done: Boolean(operation?.receipt_id || watchCompleted) },
  ];
  const firstIncomplete = steps.findIndex(({ done }) => !done);
  const activeIndex = firstIncomplete === -1 ? steps.length - 1 : firstIncomplete;
  const intent = conversation?.intent;

  return (
    <aside className="hidden w-[19rem] shrink-0 flex-col border-l bg-panel xl:flex" aria-label="Operation details">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <strong className="text-xs font-medium">Details</strong>
        {busy ? <span className="inline-flex items-center gap-1.5 text-[10px] text-blue-700"><i className="size-1.5 animate-pulse rounded-full bg-current" />working</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b p-4">
          <div className="mb-4 flex items-center justify-between"><h2 className="panel-label">Progress</h2><span className="text-[10px] text-muted-foreground">{watch ? watchProgressLabels[watch.status] : conversationStateLabels[state]}</span></div>
          <ol>
            {steps.map((step, index) => (
              <li className="relative grid grid-cols-[18px_1fr] gap-2.5 pb-4 last:pb-0" key={step.label}>
                {index < steps.length - 1 ? <i className="absolute top-4 bottom-0 left-[7px] w-px bg-border" /> : null}
                <span className={cn(
                  "relative z-10 mt-0.5 grid size-4 place-items-center rounded-full border bg-panel",
                  step.done && "border-emerald-600 bg-emerald-600 text-white",
                  index === activeIndex && !step.done && "border-blue-600 text-blue-600 shadow-[0_0_0_3px_rgb(73_105_216/0.1)]",
                )}>
                  {step.done ? <CheckIcon className="size-2.5 stroke-[3]" /> : index === activeIndex ? <CircleIcon className="size-1.5 fill-current" /> : null}
                </span>
                <span className={cn("text-xs font-medium", !step.done && index !== activeIndex && "text-muted-foreground")}>{step.label}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-b p-4">
          <h2 className="panel-label">Understood request</h2>
          {intent && conversation?.missing_fields.length !== 6 ? (
            <dl className="mt-3 grid gap-2.5 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Route</dt><dd className="font-medium">{intent.origin_iata ?? "—"} → {intent.destination_iata ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{intent.departure_date ? formatLocalDate(intent.departure_date, intent.departure_date) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Passengers</dt><dd className="font-medium">{intent.passenger_count ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cabin</dt><dd className="font-medium">{intent.cabin ? cabinLabel(intent.cabin) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Limit</dt><dd className="font-medium tabular-nums">{intent.max_total_budget ? formatMoney(intent.max_total_budget.amount, intent.max_total_budget.currency) : "—"}</dd></div>
            </dl>
          ) : <p className="mt-3 text-xs leading-5 text-muted-foreground">Details appear here as you chat.</p>}
          {conversation?.missing_fields.length ? (
            <p className="mt-3 border-t pt-3 text-[10px] leading-4 text-muted-foreground">
              Missing: {conversation.missing_fields.map((field) => missingFieldLabels[field]).join(", ")}.
            </p>
          ) : null}
        </section>

        {intent?.max_total_budget ? (
          <section className="border-b p-4">
            <div className="mb-3 flex items-center gap-2"><WalletCardsIcon className="size-3.5 text-blue-700" /><h2 className="panel-label">Purchase limit</h2></div>
            <strong className="block text-xl tabular-nums">{formatMoney(intent.max_total_budget.amount, intent.max_total_budget.currency)}</strong>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">This is a proposed ceiling. It does not represent spent or reserved funds.</p>
          </section>
        ) : null}

        {(operation && Object.values(operation).some(Boolean)) || watch?.mandate_id || watch?.receipt_id ? (
          <section className="p-4">
            <h2 className="panel-label">Evidence</h2>
            <dl className="mt-3 grid gap-3 text-[10px]">
              {operation?.checkout_id ? <div><dt className="text-muted-foreground">Checkout</dt><dd className="mt-0.5 break-all font-mono">{operation.checkout_id}</dd></div> : null}
              {operation?.mandate_id || watch?.mandate_id ? <div><dt className="text-muted-foreground">Mandate</dt><dd className="mt-0.5 break-all font-mono">{operation?.mandate_id ?? watch?.mandate_id}</dd></div> : null}
              {operation?.authorization_id ? <div><dt className="text-muted-foreground">Authorization</dt><dd className="mt-0.5 break-all font-mono">{operation.authorization_id}</dd></div> : null}
              {operation?.receipt_id || watch?.receipt_id ? <div><dt className="text-muted-foreground">Receipt</dt><dd className="mt-0.5 break-all font-mono">{operation?.receipt_id ?? watch?.receipt_id}</dd></div> : null}
            </dl>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function TrustedSurface() {
  const principalSession = useAuthenticatedPrincipalSession();
  const principalId = principalSession.principal.principal_id;
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState<BusyState>(null);
  const [agent, setAgent] = useState<AgentIdentity>();
  const [conversation, setConversation] = useState<TravelBotConversation>();
  const [watch, setWatch] = useState<TravelWatch | null>(null);
  const [simulation, setSimulation] = useState<{ watchId: string; message: string; polling: boolean }>();
  const [watchesByConversation, setWatchesByConversation] = useState<Record<string, TravelWatch>>({});
  const [recents, setRecents] = useState<TravelBotConversation[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string>();
  const [error, setError] = useState<BoundApiError>();
  const [failedTurn, setFailedTurn] = useState<FailedTurn>();
  const [lastCorrelationId, setLastCorrelationId] = useState<string>();
  const [arrivingAssistantMessageId, setArrivingAssistantMessageId] = useState<string>();
  const [enteringConversationId, setEnteringConversationId] = useState<string>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const activeConversationId = conversation?.conversation_id;
  const recentConversationIds = recents.map(({ conversation_id }) => conversation_id).join("|");

  const rememberWatch = useCallback((next: TravelWatch) => {
    setWatch(next);
    setWatchesByConversation((current) => ({ ...current, [next.conversation_id]: next }));
  }, []);

  const rememberConversation = useCallback((next: TravelBotConversation) => {
    setConversation(next);
    setRecents((current) => {
      const updated = [next, ...current.filter(({ conversation_id }) => conversation_id !== next.conversation_id)]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 8);
      writeRecentConversationIds(principalId, updated.map(({ conversation_id }) => conversation_id));
      return updated;
    });
  }, [principalId]);

  const createConversation = useCallback(async (signal?: AbortSignal) => {
    setBusy("creating");
    setError(undefined);
    setArrivingAssistantMessageId(undefined);
    const identity = createRequestIdentity("conversation_create");
    try {
      const result = await boundApi.createConversation(
        TRAVELBOT_ID,
        principalSession.csrf_token,
        identity,
        signal,
      );
      if (signal?.aborted) return;
      setEnteringConversationId(result.data.conversation_id);
      rememberConversation(result.data);
      updateConversationUrl(result.data.conversation_id, signal ? "replace" : "push");
      setLastCorrelationId(result.correlationId ?? identity.correlationId);
      setComposerValue("");
      setPendingMessage(undefined);
      setFailedTurn(undefined);
      setLoadState("ready");
    } catch (caught) {
      if (signal?.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
      setLoadState("error");
    } finally {
      if (!signal?.aborted) setBusy(null);
    }
  }, [principalSession.csrf_token, rememberConversation]);

  useEffect(() => {
    const controller = new AbortController();

    async function initialize() {
      setLoadState("loading");
      try {
        const [healthResult, agentResult] = await Promise.all([
          boundApi.health(controller.signal),
          boundApi.getAgent(TRAVELBOT_ID, controller.signal),
        ]);
        setAgent(agentResult.data);
        setLastCorrelationId(agentResult.correlationId ?? healthResult.correlationId);

        const requestedConversationId = new URL(window.location.href).searchParams.get("conversation");
        const recentIds = readRecentConversationIds(principalId);
        const ids = requestedConversationId
          ? [requestedConversationId, ...recentIds.filter((id) => id !== requestedConversationId)]
          : recentIds;
        const loaded = await Promise.allSettled(ids.map((id) => boundApi.getConversation(id, controller.signal)));
        const conversations = loaded
          .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof boundApi.getConversation>>> => result.status === "fulfilled")
          .map((result) => result.value.data)
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
        if (conversations.length) {
          setRecents(conversations);
          const selectedConversation = conversations.find(({ conversation_id }) => conversation_id === requestedConversationId) ?? conversations[0];
          setEnteringConversationId(selectedConversation.conversation_id);
          setConversation(selectedConversation);
          if (!requestedConversationId) updateConversationUrl(selectedConversation.conversation_id, "replace");
          setLastCorrelationId(messageCorrelationId(selectedConversation) ?? agentResult.correlationId ?? healthResult.correlationId);
          writeRecentConversationIds(principalId, conversations.map(({ conversation_id }) => conversation_id));
          setLoadState("ready");
          return;
        }
        await createConversation(controller.signal);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        const apiError = asApiError(caught);
        setError(apiError);
        setLastCorrelationId(apiError.correlationId);
        setLoadState("error");
      }
    }

    void initialize();
    return () => controller.abort();
  }, [createConversation, principalId]);

  useEffect(() => {
    const conversationIds = recentConversationIds ? recentConversationIds.split("|") : [];
    if (!conversationIds.length) return;
    const controller = new AbortController();
    async function refreshWatches() {
      try {
        const results = await Promise.allSettled(
          conversationIds.map((conversationId) => boundApi.getConversationWatch(conversationId, controller.signal)),
        );
        if (controller.signal.aborted) return;
        const next = Object.fromEntries(results.flatMap((result) => (
          result.status === "fulfilled" && result.value.data
            ? [[result.value.data.conversation_id, result.value.data] as const]
            : []
        )));
        setWatchesByConversation(next);
        setWatch(activeConversationId ? next[activeConversationId] ?? null : null);
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(asApiError(caught));
      }
    }
    void refreshWatches();
    const interval = window.setInterval(() => void refreshWatches(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [activeConversationId, recentConversationIds]);

  useEffect(() => {
    if (!simulation?.polling) return;
    const controller = new AbortController();
    let attempts = 0;
    const refresh = async () => {
      attempts += 1;
      try {
        const result = await boundApi.getTravelWatch(simulation.watchId, controller.signal);
        if (controller.signal.aborted) return;
        rememberWatch(result.data);
        if (result.data.status === "COMPLETED") {
          setSimulation({
            watchId: result.data.watch_id,
            message: `Simulation completed through the regular purchase flow. Receipt ${result.data.receipt_id ?? "created"}.`,
            polling: false,
          });
        } else if (["FAILED", "CANCELLED", "EXPIRED"].includes(result.data.status)) {
          setSimulation({
            watchId: result.data.watch_id,
            message: `The simulation stopped with status ${result.data.status.toLowerCase()}. Check the error and audit trail before trying again.`,
            polling: false,
          });
        } else if (attempts >= 45) {
          setSimulation({
            watchId: result.data.watch_id,
            message: "The demo fare is queued. The background worker will continue processing it.",
            polling: false,
          });
        }
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError(asApiError(caught));
        setSimulation((current) => current ? { ...current, polling: false } : current);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 1_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [rememberWatch, simulation?.polling, simulation?.watchId]);

  const selectConversation = useCallback(async (conversationId: string, updateUrl = true) => {
    if (conversationId === conversation?.conversation_id || busy) return;
    setBusy("switching");
    setError(undefined);
    setArrivingAssistantMessageId(undefined);
    try {
      const result = await boundApi.getConversation(conversationId);
      setEnteringConversationId(result.data.conversation_id);
      rememberConversation(result.data);
      if (updateUrl) updateConversationUrl(result.data.conversation_id, "push");
      setLastCorrelationId(messageCorrelationId(result.data) ?? result.correlationId);
      setComposerValue("");
      setPendingMessage(undefined);
      setFailedTurn(undefined);
    } catch (caught) {
      setError(asApiError(caught));
    } finally {
      setBusy(null);
    }
  }, [busy, conversation?.conversation_id, rememberConversation]);

  useEffect(() => {
    const handleHistoryNavigation = () => {
      const conversationId = new URL(window.location.href).searchParams.get("conversation");
      if (conversationId && conversationId !== activeConversationId) {
        if (busy && activeConversationId) {
          updateConversationUrl(activeConversationId, "replace");
          return;
        }
        void selectConversation(conversationId, false);
      }
    };
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => window.removeEventListener("popstate", handleHistoryNavigation);
  }, [activeConversationId, busy, selectConversation]);

  const discardConversation = useCallback(async (conversationId: string) => {
    if (busy) throw new Error("Wait for the current action to finish before discarding a conversation.");
    const discardingActiveConversation = conversation?.conversation_id === conversationId;
    setBusy("deleting");
    const identity = createRequestIdentity("conversation_discard");
    try {
      const result = await boundApi.discardConversation(conversationId, principalSession.csrf_token, identity);
      setLastCorrelationId(result.correlationId ?? identity.correlationId);
      setRecents((current) => {
        const updated = current.filter(({ conversation_id: candidate }) => candidate !== conversationId);
        writeRecentConversationIds(principalId, updated.map(({ conversation_id }) => conversation_id));
        return updated;
      });
      setWatchesByConversation((current) => {
        return Object.fromEntries(Object.entries(current).filter(([candidate]) => candidate !== conversationId));
      });
      if (discardingActiveConversation) {
        setConversation(undefined);
        setPendingMessage(undefined);
        setFailedTurn(undefined);
        setComposerValue("");
        setLoadState("loading");
        await createConversation();
      }
    } catch (caught) {
      throw asApiError(caught);
    } finally {
      setBusy(null);
    }
  }, [busy, conversation?.conversation_id, createConversation, principalId, principalSession.csrf_token]);

  const submitTurn = useCallback(async (
    text: string,
    {
      identity = createRequestIdentity("conversation_message"),
      mode = "chat",
    }: SubmitTurnOptions = {},
  ) => {
    if (!conversation || busy || !text.trim()) return;
    const cleanText = text.trim();
    setBusy(mode === "authority" ? "authorizing" : "sending");
    setError(undefined);
    setFailedTurn(undefined);
    setArrivingAssistantMessageId(undefined);
    setPendingMessage(mode === "chat" ? cleanText : undefined);
    setComposerValue("");
    try {
      const result = await boundApi.postConversationMessage(
        conversation.conversation_id,
        cleanText,
        principalSession.csrf_token,
        identity,
      );
      const existingMessageIds = new Set(conversation.messages.map(({ message_id: messageId }) => messageId));
      const arrivingAssistant = result.data.messages
        .filter(({ message_id: messageId, role }) => role === "ASSISTANT" && !existingMessageIds.has(messageId))
        .at(-1);
      setArrivingAssistantMessageId(arrivingAssistant?.message_id);
      rememberConversation(result.data);
      setLastCorrelationId(result.correlationId ?? identity.correlationId);
      setPendingMessage(undefined);
      return result.data;
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setFailedTurn({ text: cleanText, identity, mode });
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
    } finally {
      setBusy(null);
    }
  }, [busy, conversation, principalSession.csrf_token, rememberConversation]);

  const beginBiometricAuthorization = useCallback(async () => {
    const approval = conversation?.operation.pending_approval;
    if (!conversation || !approval || busy) return;
    setBusy("verifying");
    setError(undefined);
    setFailedTurn(undefined);
    try {
      const principal = await boundApi.getPrincipalSession();
      if (!principal.data.authenticated) {
        throw new BoundApiError({ message: "Your session expired. Sign in again before authorizing.", code: "session_expired", status: 401 });
      }
      const started = await boundApi.startMandateBiometricConsent(
        approval.mandate_id,
        principal.data.csrf_token,
        createRequestIdentity("biometric_consent"),
      );
      if (started.data.hosted_verification_url === null) {
        throw new BoundApiError({ message: "The secure selfie session could not be opened. Try again.", code: "biometric_session_unavailable" });
      }
      writePendingBiometricConsent({
        conversationId: conversation.conversation_id,
        mandateId: approval.mandate_id,
        consentId: started.data.consent_id,
        refreshIdentity: createRequestIdentity("biometric_refresh"),
        confirmationIdentity: createRequestIdentity("biometric_confirmation"),
      });
      window.location.assign(started.data.hosted_verification_url);
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId);
      setBusy(null);
    }
  }, [busy, conversation]);

  const beginWatchBiometricAuthorization = useCallback(async (target: TravelWatch) => {
    if (!conversation || busy || target.status !== "AWAITING_LIVENESS") return;
    setBusy("verifying");
    setError(undefined);
    try {
      const principal = await boundApi.getPrincipalSession();
      if (!principal.data.authenticated) {
        throw new BoundApiError({ message: "Your session expired. Sign in again before authorizing.", code: "session_expired", status: 401 });
      }
      const started = await boundApi.startMandateBiometricConsent(
        target.mandate_id,
        principal.data.csrf_token,
        createRequestIdentity("watch_biometric_consent"),
      );
      if (started.data.hosted_verification_url === null) {
        throw new BoundApiError({ message: "The secure selfie session could not be opened. Try again.", code: "biometric_session_unavailable" });
      }
      writePendingBiometricConsent({
        conversationId: conversation.conversation_id,
        watchId: target.watch_id,
        mandateId: target.mandate_id,
        consentId: started.data.consent_id,
        refreshIdentity: createRequestIdentity("watch_biometric_refresh"),
        confirmationIdentity: createRequestIdentity("watch_activation"),
      });
      window.location.assign(started.data.hosted_verification_url);
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId);
      setBusy(null);
    }
  }, [busy, conversation]);

  const createTravelWatch = useCallback(async () => {
    if (!conversation || busy || !conversation.intent.departure_date) return;
    setBusy("watching");
    setError(undefined);
    const identity = createRequestIdentity("watch_create");
    try {
      const expiresAt = watchExpiryForDeparture(conversation.intent.departure_date);
      if (Date.parse(expiresAt) <= Date.now()) {
        throw new BoundApiError({ message: "This departure window has already ended. Update the date before starting monitoring.", code: "watch_window_ended" });
      }
      const created = await boundApi.createTravelWatch(
        conversation.conversation_id,
        { mode: "AUTO_PURCHASE", expires_at: expiresAt },
        identity,
      );
      rememberWatch(created.data);
      setLastCorrelationId(created.correlationId ?? identity.correlationId);
      setBusy(null);
      await beginWatchBiometricAuthorization(created.data);
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
      setBusy(null);
    }
  }, [beginWatchBiometricAuthorization, busy, conversation, rememberWatch]);

  const cancelTravelWatch = useCallback(async (target: TravelWatch) => {
    if (busy) return;
    setBusy("watching");
    setError(undefined);
    const identity = createRequestIdentity("watch_cancel");
    try {
      const cancelled = await boundApi.cancelTravelWatch(target.watch_id, identity);
      rememberWatch(cancelled.data);
      setLastCorrelationId(cancelled.correlationId ?? identity.correlationId);
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
    } finally {
      setBusy(null);
    }
  }, [busy, rememberWatch]);

  const simulateTravelWatch = useCallback(async (target: TravelWatch) => {
    if (busy || !SHOW_DEVELOPMENT_SIMULATOR || target.status !== "ACTIVE") return;
    setBusy("simulating");
    setError(undefined);
    const identity = createRequestIdentity("watch_simulate_match");
    try {
      const simulated = await boundApi.simulateTravelWatchMatch(target.watch_id, identity);
      rememberWatch(simulated.data);
      setLastCorrelationId(simulated.correlationId ?? identity.correlationId);
      setSimulation({
        watchId: target.watch_id,
        message: "Eligible demo fare queued. Jaguary is checking it through the normal purchase pipeline now.",
        polling: true,
      });
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
    } finally {
      setBusy(null);
    }
  }, [busy, rememberWatch]);

  const updateComposer = useCallback((value: string) => setComposerValue(value), []);
  const handleVoiceTurn = useCallback(async (transcript: string) => {
    const existingMessageIds = new Set(conversation?.messages.map(({ message_id: messageId }) => messageId) ?? []);
    const updated = await submitTurn(transcript);
    return updated?.messages
      .filter(({ message_id: messageId, role }) => role === "ASSISTANT" && !existingMessageIds.has(messageId))
      .at(-1)?.content;
  }, [conversation?.messages, submitTurn]);
  const voice = useRealtimeVoice({
    conversationId: conversation?.conversation_id,
    csrfToken: principalSession.csrf_token,
    enabled: loadState === "ready",
    onTranscriptChange: updateComposer,
    onTurn: handleVoiceTurn,
  });

  function handleSubmit(message: PromptInputMessage) {
    void submitTurn(message.text);
  }
  const showApproval = conversation?.state === "AWAITING_AUTHORITY_CONFIRMATION" && Boolean(conversation.operation.pending_approval);
  const enteringHistory = conversation?.conversation_id === enteringConversationId && arrivingAssistantMessageId === undefined;
  const hasIntentSummary = Boolean(
    conversation?.intent.origin_iata
    || conversation?.intent.destination_iata
    || conversation?.intent.departure_date,
  );
  const isBusy = busy !== null;
  const latestMessage = conversation?.messages.at(-1);
  const quickReplyGroup = conversation?.state === "COLLECTING" && latestMessage?.role === "ASSISTANT"
    ? travelQuickReplyGroup(conversation.missing_fields, new Date(), conversation.intent)
    : undefined;
  const showDockedComposer = Boolean(conversation?.messages.length || pendingMessage || busy === "sending");
  const visibleWatch = watch?.conversation_id === conversation?.conversation_id ? watch : null;
  const canOfferTravelWatch = Boolean(
    conversation
    && conversation.state === "READY_TO_SEARCH"
    && conversation.offers.length === 0
    && conversation.missing_fields.length === 0,
  );

  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden" style={{ "--sidebar-width": "15.5rem" } as CSSProperties}>
      <AppSidebar
        activeConversationId={conversation?.conversation_id}
        conversations={recents}
        newConversationDisabled={isBusy || loadState === "loading"}
        onDiscardConversation={discardConversation}
        onNewConversation={() => void createConversation()}
        onSelectConversation={(conversationId) => void selectConversation(conversationId)}
        watchesByConversation={watchesByConversation}
      />

      <SidebarInset className="h-dvh min-w-0 flex-row overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-12 shrink-0 items-center justify-between border-b bg-panel px-3 md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger />
              <span className="h-4 w-px bg-border" aria-hidden="true" />
              <div className="min-w-0">
                <strong className="block truncate text-xs">{conversation ? conversationTitle(conversation) : "TravelBot"}</strong>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <i className={cn("size-1.5 rounded-full", loadState === "ready" ? "bg-emerald-600" : loadState === "error" ? "bg-destructive" : "animate-pulse bg-amber-500")} />
                  {loadState === "ready" ? conversationStateLabels[conversation?.state ?? "COLLECTING"] : loadState === "error" ? "API unavailable" : "Connecting"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agent ? <span className="hidden items-center gap-1.5 text-[10px] text-emerald-700 sm:flex"><ShieldCheckIcon className="size-3" />{agent.display_name} identified</span> : null}
              {lastCorrelationId ? (
                <Button aria-label="Copy correlation ID" onClick={() => void navigator.clipboard.writeText(lastCorrelationId)} size="icon-sm" title={`Correlation ID: ${lastCorrelationId}`} variant="ghost"><CopyIcon /></Button>
              ) : null}
            </div>
          </header>

          <Conversation aria-busy={busy === "sending" || busy === "authorizing"} className="min-h-0 min-w-0 overflow-x-hidden bg-workspace">
            <ConversationContent
              className={cn(
                "relative mx-auto min-h-full min-w-0 w-full max-w-3xl gap-7 overflow-x-hidden px-4 py-7 transition-opacity duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] md:px-8 md:py-10",
                !conversation?.messages.length && !pendingMessage && busy !== "sending" && "justify-start sm:justify-center",
                (busy === "creating" || busy === "switching") && "opacity-60",
              )}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {loadState === "loading" ? (
                  <ChatPresenceItem className="my-auto flex items-center justify-center" key="conversation-loading">
                    <Shimmer className="text-sm text-muted-foreground">Opening your secure conversation…</Shimmer>
                  </ChatPresenceItem>
                ) : null}

                {loadState === "error" && !conversation ? (
                  <ChatPresenceItem key="conversation-load-error">
                    <ErrorNotice error={error ?? new BoundApiError({ message: "The Jaguary API did not respond.", offline: true })} onRetry={() => void createConversation()} />
                  </ChatPresenceItem>
                ) : null}

                {loadState === "ready" && conversation && !conversation.messages.length && !pendingMessage ? (
                  <ChatPresenceItem key="welcome">
                    <Welcome
                      composerValue={composerValue}
                      disabled={isBusy}
                      onComposerChange={setComposerValue}
                      onSubmit={(value) => void submitTurn(value)}
                      onSuggestion={(value) => void submitTurn(value)}
                      principalName={principalSession.principal.display_name}
                      voice={voice}
                    />
                  </ChatPresenceItem>
                ) : null}

                {conversation?.messages.map((message, index) => (
                  <ChatPresenceItem
                    delay={enteringHistory ? Math.min(index * 0.025, 0.15) : message.message_id === arrivingAssistantMessageId ? 0.08 : 0}
                    enter={enteringHistory || message.message_id === arrivingAssistantMessageId}
                    key={message.message_id}
                  >
                    {message.role === "USER" ? (
                      <UserMessage message={message} status="sent" />
                    ) : (
                      <AssistantMessage message={message} />
                    )}
                  </ChatPresenceItem>
                ))}

                {pendingMessage ? (
                  <ChatPresenceItem key="pending-user-message">
                    <UserMessage
                      message={{ content: pendingMessage, created_at: new Date().toISOString() }}
                      status={failedTurn?.text === pendingMessage ? "failed" : "sent"}
                    />
                  </ChatPresenceItem>
                ) : null}

                {busy === "sending" ? (
                  <ChatPresenceItem key="working-status">
                    <WorkingStatus state={conversation?.state ?? "COLLECTING"} />
                  </ChatPresenceItem>
                ) : null}

                {quickReplyGroup ? (
                  <ChatPresenceItem
                    delay={arrivingAssistantMessageId ? 0.14 : 0}
                    key={`quick-replies-${activeConversationId}-${quickReplyGroup.field}`}
                  >
                    <QuickReplies
                      disabled={isBusy}
                      group={quickReplyGroup}
                      onCustomAnswer={() => composerRef.current?.focus()}
                      onSelect={(value) => void submitTurn(value)}
                    />
                  </ChatPresenceItem>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false} mode="popLayout">
                {conversation && hasIntentSummary ? (
                  <ChatPresenceItem delay={arrivingAssistantMessageId ? 0.12 : 0} key={`intent-summary-${conversation.conversation_id}-${conversation.updated_at}`}>
                    <IntentSummary conversation={conversation} onEdit={() => composerRef.current?.focus()} />
                  </ChatPresenceItem>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false} mode="popLayout">
                {conversation && (visibleWatch !== null || canOfferTravelWatch) ? (
                  <ChatPresenceItem key={visibleWatch?.status === "COMPLETED" ? `watch-receipt-${visibleWatch.receipt_id}` : `travel-watch-${conversation.conversation_id}-${visibleWatch?.version ?? "proposal"}`}>
                    {visibleWatch?.status === "COMPLETED" ? (
                      <PurchaseReceipt watch={visibleWatch} />
                    ) : (
                      <TravelWatchCard
                        conversation={conversation}
                        disabled={isBusy}
                        onAuthorize={(target) => void beginWatchBiometricAuthorization(target)}
                        onCancel={(target) => void cancelTravelWatch(target)}
                        onCreate={() => void createTravelWatch()}
                        onSimulate={(target) => void simulateTravelWatch(target)}
                        simulationMessage={simulation && simulation.watchId === visibleWatch?.watch_id ? simulation.message : undefined}
                        simulationRunning={Boolean(simulation && simulation.watchId === visibleWatch?.watch_id && simulation.polling)}
                        watch={visibleWatch}
                      />
                    )}
                  </ChatPresenceItem>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false} mode="popLayout">
                {showApproval || conversation?.state === "COMPLETED" ? (
                  <ChatPresenceItem delay={arrivingAssistantMessageId ? 0.16 : 0} key={`authority-surface-${conversation.conversation_id}`} layout={false}>
                    <AuthoritySurface
                      conversation={conversation}
                      disabled={isBusy}
                      onDecision={(approved) => approved
                        ? void beginBiometricAuthorization()
                        : void submitTurn("I do not authorize this purchase.", { mode: "authority" })}
                    />
                  </ChatPresenceItem>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false} mode="popLayout">
                {error && conversation ? (
                  <ChatPresenceItem key={`conversation-error-${error.correlationId ?? error.code}`}>
                    <ErrorNotice
                      error={error}
                      onRetry={failedTurn ? () => void submitTurn(failedTurn.text, { identity: failedTurn.identity, mode: failedTurn.mode }) : undefined}
                    />
                  </ChatPresenceItem>
                ) : null}
              </AnimatePresence>
            </ConversationContent>
            <ConversationScrollButton aria-label="Go to the end of the conversation" />
          </Conversation>

          {showDockedComposer ? <footer className="min-w-0 shrink-0 overflow-hidden border-t bg-panel px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:px-6">
            <div className="mx-auto min-w-0 max-w-3xl">
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputBody>
                  <PromptInputTextarea
                    className="min-h-12"
                    disabled={!conversation || isBusy || loadState !== "ready"}
                    onChange={(event) => setComposerValue(event.currentTarget.value)}
                    placeholder={
                      loadState === "loading"
                        ? "Waiting for Jaguary…"
                        : loadState === "error" && !conversation
                          ? "Connect the API to begin…"
                            : voice.active
                            ? voice.label
                            : quickReplyGroup?.inputPlaceholder ?? "Talk to TravelBot…"
                    }
                    ref={composerRef}
                    value={composerValue}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <Button
                      aria-label={voice.active ? "End voice conversation" : voice.supported ? "Start voice conversation" : "Voice mode is not supported in this browser"}
                      aria-pressed={voice.active}
                      className={cn("rounded-md", voice.active && "bg-red-50 text-destructive hover:bg-red-100")}
                      disabled={!voice.supported || !conversation || (isBusy && !voice.active)}
                      onClick={voice.toggle}
                      size="icon-sm"
                      title={voice.supported ? voice.label : "Your browser does not support realtime voice"}
                      type="button"
                      variant="ghost"
                    >
                      {voice.active ? <SquareIcon className="size-3.5 fill-current" /> : voice.supported ? <MicIcon /> : <MicOffIcon />}
                    </Button>
                    {voice.active ? <span className="hidden items-center gap-1.5 text-[10px] text-destructive sm:inline-flex"><i className="size-1.5 animate-pulse rounded-full bg-current" />{voice.label}</span> : null}
                  </PromptInputTools>
                  <PromptInputSubmit disabled={!composerValue.trim() || !conversation || isBusy || loadState !== "ready"} status={busy === "sending" ? "submitted" : "ready"} />
                </PromptInputFooter>
              </PromptInput>
              <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1">
                <p className={cn("text-[10px]", voice.error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                  {voice.error ?? (voice.active ? `${voice.label}. AI-generated voice.` : voice.supported ? "Start voice mode for a hands-free conversation." : "Enter sends · Shift+Enter adds a new line")}
                </p>
                <span className="hidden truncate font-mono text-[9px] text-muted-foreground sm:block">{shortId(apiUrl, 28, 0)}</span>
              </div>
            </div>
          </footer> : null}
        </main>
        <OperationInspector busy={busy} conversation={conversation} watch={visibleWatch} />
      </SidebarInset>
    </SidebarProvider>
  );
}
