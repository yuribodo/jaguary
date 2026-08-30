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
  ArrowRightIcon,
  BotIcon,
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
  PlaneIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  WalletCardsIcon,
  WifiOffIcon,
} from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useStickToBottomContext } from "use-stick-to-bottom";

import { AppSidebar } from "@/components/app-sidebar";
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
import { cn } from "@/lib/utils";
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
} from "@/lib/contracts";

const PRINCIPAL_ID = "principal_marta";
const TRAVELBOT_ID = "agent_travelbot";
const STARTER_PROMPTS = [
  "I want to travel from GRU to COR on September 15, 2026, one passenger, economy, up to US$1,000.",
  "Find a flight from São Paulo to Córdoba on September 15 for up to US$1,000.",
];

type LoadState = "loading" | "ready" | "error";
type BusyState = "authorizing" | "creating" | "switching" | "sending" | "verifying" | null;
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

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechResultEvent = { results: ArrayLike<SpeechResult> };
type SpeechErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function asApiError(error: unknown) {
  if (error instanceof BoundApiError) {
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
};

function freshnessLabel(observedAt: string) {
  return `at ${formatTime(observedAt)}`;
}

function officialFlightHref(offer: OfferCandidate) {
  const source = new URL(offer.source_url);
  if (offer.merchant_id === "merchant_vuelaya" && source.hostname === "demo.vuelaya.example") {
    return `/connected-merchants/vuelaya${source.pathname}`;
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

function useSpeechInput(
  value: string,
  onChange: (value: string) => void,
  disabled: boolean,
) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseValueRef = useRef("");
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const frame = requestAnimationFrame(() => {
      setSupported(Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition));
    });
    return () => {
      cancelAnimationFrame(frame);
      recognitionRef.current?.abort();
    };
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition || disabled) return;

    setError(undefined);
    baseValueRef.current = value.trim();
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      const separator = baseValueRef.current && transcript ? " " : "";
      onChange(`${baseValueRef.current}${separator}${transcript}`);
    };
    recognition.onerror = (event) => {
      const label = event.error === "not-allowed"
        ? "Allow microphone access to dictate a message."
        : event.error === "no-speech"
          ? "I did not hear any speech. Try again."
          : "Your speech could not be recognized right now.";
      setError(label);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("The microphone could not be started.");
    }
  }, [disabled, listening, onChange, value]);

  return { supported, listening, error, toggle };
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

function Welcome({ disabled, onSuggestion }: { disabled: boolean; onSuggestion: (value: string) => void }) {
  return (
    <div className="my-auto flex min-h-[25rem] flex-col justify-center py-10">
      <span className="mb-5 grid size-10 place-items-center rounded-lg border bg-panel text-blue-700 shadow-sm">
        <SparklesIcon className="size-5" />
      </span>
      <h1 className="max-w-xl font-serif text-4xl leading-[1.05] tracking-tight md:text-5xl">
        Where are we going, Marta?
      </h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
        Share your trip details. TravelBot checks Google Flights, compares options, and prepares the purchase — always asking for confirmation before moving any money.
      </p>
      <div className="mt-7 grid max-w-2xl gap-2">
        {STARTER_PROMPTS.map((suggestion) => (
          <Button
            className="h-auto w-full justify-start whitespace-normal rounded-full px-4 py-2.5 text-left leading-5"
            disabled={disabled}
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            variant="outline"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

function IntentSummary({ conversation }: { conversation: TravelBotConversation }) {
  const { intent } = conversation;
  if (!intent.origin_iata && !intent.destination_iata && !intent.departure_date) return null;
  const summaryStatus = conversation.missing_fields.length
    ? `${conversation.missing_fields.length} details missing`
    : conversation.state === "AWAITING_AUTHORITY_CONFIRMATION"
      ? "Flight selected"
      : conversation.state === "COMPLETED"
        ? "Purchase completed"
        : "Ready to search";
  return (
    <section className="rounded-xl border bg-panel/70 p-3.5" aria-label="Understood trip request">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold"><CheckIcon className="size-3.5 text-emerald-700" />I understood your trip</span>
        <span className={cn("text-[10px]", conversation.missing_fields.length ? "text-amber-700" : "text-emerald-700")}>{summaryStatus}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
        <div><dt className="text-[10px] text-muted-foreground">Route</dt><dd className="mt-0.5 font-semibold">{intent.origin_iata ?? "—"} → {intent.destination_iata ?? "—"}</dd></div>
        <div><dt className="text-[10px] text-muted-foreground">Date</dt><dd className="mt-0.5 font-medium">{intent.departure_date ? formatLocalDate(intent.departure_date, intent.departure_date) : "—"}</dd></div>
        <div><dt className="text-[10px] text-muted-foreground">Travelers</dt><dd className="mt-0.5 font-medium">{intent.passenger_count ?? "—"}</dd></div>
        <div><dt className="text-[10px] text-muted-foreground">Cabin</dt><dd className="mt-0.5 font-medium">{intent.cabin ? cabinLabel(intent.cabin) : "—"}</dd></div>
        <div className="col-span-2 sm:col-span-1"><dt className="text-[10px] text-muted-foreground">Total limit</dt><dd className="mt-0.5 font-semibold tabular-nums">{intent.max_total_budget ? formatMoney(intent.max_total_budget.amount, intent.max_total_budget.currency) : "—"}</dd></div>
      </dl>
      {conversation.missing_fields.length ? <p className="mt-2.5 border-t pt-2.5 text-[10px] text-muted-foreground">Still needed: {conversation.missing_fields.map((field) => missingFieldLabels[field]).join(", ")}.</p> : null}
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
  "mandate.activated": { title: "Authority activated", detail: "Marta's signed mandate became valid." },
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

function loadPurchaseEvidence(receiptId: string, correlationId: string) {
  const key = `${receiptId}:${correlationId}`;
  const cached = purchaseEvidenceRequests.get(key);
  if (cached) return cached;
  const request = Promise.allSettled([
    boundApi.getReceipt(receiptId),
    boundApi.getAuditTimeline(correlationId),
  ]).then(([receiptResult, timelineResult]) => {
    const receipt = receiptResult.status === "fulfilled" ? receiptResult.value.data : undefined;
    const timeline = timelineResult.status === "fulfilled" ? timelineResult.value.data : undefined;
    return {
      receipt,
      timeline,
      error: receipt && timeline ? undefined : "Some audit evidence could not be loaded. The saved receipt remains available.",
    };
  });
  purchaseEvidenceRequests.set(key, request);
  return request;
}

function PurchaseReceipt({ conversation }: { conversation: TravelBotConversation }) {
  const reduceMotion = useReducedMotion();
  const receiptId = conversation.operation.receipt_id;
  const auditCorrelationId = conversation.messages.filter(({ role }) => role === "USER").at(-1)?.correlation_id;
  const [evidence, setEvidence] = useState<{
    key?: string;
    receipt?: OrderReceipt;
    timeline?: AuditTimeline;
    error?: string;
  }>({});
  const expectedEvidenceKey = receiptId && auditCorrelationId ? `${receiptId}:${auditCorrelationId}` : undefined;
  const evidenceLoading = Boolean(expectedEvidenceKey && evidence.key !== expectedEvidenceKey);
  const currentEvidence = evidence.key === expectedEvidenceKey ? evidence : {};

  useEffect(() => {
    if (conversation.state !== "COMPLETED" || !receiptId || !auditCorrelationId) return;
    const completedReceiptId = receiptId;
    const completedCorrelationId = auditCorrelationId;
    const key = `${completedReceiptId}:${completedCorrelationId}`;
    let cancelled = false;
    void loadPurchaseEvidence(completedReceiptId, completedCorrelationId).then((result) => {
      if (!cancelled) setEvidence({ key, ...result });
    });
    return () => { cancelled = true; };
  }, [auditCorrelationId, conversation.state, receiptId]);

  if (conversation.state !== "COMPLETED" || !receiptId) return null;
  const offer = conversation.offers.find(({ offer_id: offerId }) => offerId === conversation.intent.selected_offer_id);
  if (!offer) return null;
  const receipt = currentEvidence.receipt;
  const fulfillment = receipt?.fulfillment ?? offer.fulfillment;
  const travelers = conversation.intent.passenger_count ?? 1;
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
            <div><dt className="text-[#777b82]">Correlation</dt><dd className="mt-0.5 break-all font-mono">{currentEvidence.timeline?.correlation_id ?? auditCorrelationId ?? "Unavailable"}</dd></div>
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

function ErrorNotice({ error, onRetry }: { error: BoundApiError; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-sm" role="alert">
      {error.offline ? <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div className="min-w-0 flex-1">
        <strong className="block text-xs">{error.offline ? "Jaguary API unavailable" : "Could not complete"}</strong>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{error.message}</p>
        {error.correlationId ? <code className="mt-1 block break-all text-[10px] text-muted-foreground">{error.correlationId}</code> : null}
      </div>
      {onRetry ? <Button onClick={onRetry} size="sm" variant="outline"><RefreshCwIcon />Try again</Button> : null}
    </div>
  );
}

function OperationInspector({ conversation, busy }: { conversation?: TravelBotConversation; busy: BusyState }) {
  const state = conversation?.state ?? "COLLECTING";
  const operation = conversation?.operation;
  const steps = [
    { label: "Understand request", done: Boolean(conversation && conversation.missing_fields.length === 0) },
    { label: "Choose best flight", done: Boolean(conversation?.intent.selected_offer_id) },
    { label: "Lock checkout", done: Boolean(operation?.checkout_id) },
    { label: "Obtain authority", done: Boolean(operation?.mandate_id) },
    { label: "Purchase and issue", done: Boolean(operation?.receipt_id) },
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
          <div className="mb-4 flex items-center justify-between"><h2 className="panel-label">Progress</h2><span className="text-[10px] text-muted-foreground">{conversationStateLabels[state]}</span></div>
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

        {operation && Object.values(operation).some(Boolean) ? (
          <section className="p-4">
            <h2 className="panel-label">Evidence</h2>
            <dl className="mt-3 grid gap-3 text-[10px]">
              {operation.checkout_id ? <div><dt className="text-muted-foreground">Checkout</dt><dd className="mt-0.5 break-all font-mono">{operation.checkout_id}</dd></div> : null}
              {operation.mandate_id ? <div><dt className="text-muted-foreground">Mandate</dt><dd className="mt-0.5 break-all font-mono">{operation.mandate_id}</dd></div> : null}
              {operation.authorization_id ? <div><dt className="text-muted-foreground">Authorization</dt><dd className="mt-0.5 break-all font-mono">{operation.authorization_id}</dd></div> : null}
              {operation.receipt_id ? <div><dt className="text-muted-foreground">Receipt</dt><dd className="mt-0.5 break-all font-mono">{operation.receipt_id}</dd></div> : null}
            </dl>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

export function TrustedSurface() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState<BusyState>(null);
  const [agent, setAgent] = useState<AgentIdentity>();
  const [conversation, setConversation] = useState<TravelBotConversation>();
  const [recents, setRecents] = useState<TravelBotConversation[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string>();
  const [error, setError] = useState<BoundApiError>();
  const [failedTurn, setFailedTurn] = useState<FailedTurn>();
  const [lastCorrelationId, setLastCorrelationId] = useState<string>();
  const [arrivingAssistantMessageId, setArrivingAssistantMessageId] = useState<string>();
  const [enteringConversationId, setEnteringConversationId] = useState<string>();

  const rememberConversation = useCallback((next: TravelBotConversation) => {
    setConversation(next);
    setRecents((current) => {
      const updated = [next, ...current.filter(({ conversation_id }) => conversation_id !== next.conversation_id)]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 8);
      writeRecentConversationIds(updated.map(({ conversation_id }) => conversation_id));
      return updated;
    });
  }, []);

  const createConversation = useCallback(async (signal?: AbortSignal) => {
    setBusy("creating");
    setError(undefined);
    setArrivingAssistantMessageId(undefined);
    const identity = createRequestIdentity("conversation_create");
    try {
      const result = await boundApi.createConversation(
        { principal_id: PRINCIPAL_ID, agent_id: TRAVELBOT_ID },
        identity,
        signal,
      );
      if (signal?.aborted) return;
      setEnteringConversationId(result.data.conversation_id);
      rememberConversation(result.data);
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
  }, [rememberConversation]);

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
        const recentIds = readRecentConversationIds();
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
          setLastCorrelationId(messageCorrelationId(selectedConversation) ?? agentResult.correlationId ?? healthResult.correlationId);
          writeRecentConversationIds(conversations.map(({ conversation_id }) => conversation_id));
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
  }, [createConversation]);

  const selectConversation = useCallback(async (conversationId: string) => {
    if (conversationId === conversation?.conversation_id || busy) return;
    setBusy("switching");
    setError(undefined);
    setArrivingAssistantMessageId(undefined);
    try {
      const result = await boundApi.getConversation(conversationId);
      setEnteringConversationId(result.data.conversation_id);
      rememberConversation(result.data);
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
      const result = await boundApi.postConversationMessage(conversation.conversation_id, cleanText, identity);
      const existingMessageIds = new Set(conversation.messages.map(({ message_id: messageId }) => messageId));
      const arrivingAssistant = result.data.messages
        .filter(({ message_id: messageId, role }) => role === "ASSISTANT" && !existingMessageIds.has(messageId))
        .at(-1);
      setArrivingAssistantMessageId(arrivingAssistant?.message_id);
      rememberConversation(result.data);
      setLastCorrelationId(result.correlationId ?? identity.correlationId);
      setPendingMessage(undefined);
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setFailedTurn({ text: cleanText, identity, mode });
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
    } finally {
      setBusy(null);
    }
  }, [busy, conversation, rememberConversation]);

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

  function handleSubmit(message: PromptInputMessage) {
    void submitTurn(message.text);
  }

  const updateComposer = useCallback((value: string) => setComposerValue(value), []);
  const speech = useSpeechInput(composerValue, updateComposer, busy !== null || loadState !== "ready");
  const showApproval = conversation?.state === "AWAITING_AUTHORITY_CONFIRMATION" && Boolean(conversation.operation.pending_approval);
  const enteringHistory = conversation?.conversation_id === enteringConversationId && arrivingAssistantMessageId === undefined;
  const hasIntentSummary = Boolean(
    conversation?.intent.origin_iata
    || conversation?.intent.destination_iata
    || conversation?.intent.departure_date,
  );
  const isBusy = busy !== null;

  return (
    <SidebarProvider className="h-dvh min-h-0 overflow-hidden" style={{ "--sidebar-width": "15.5rem" } as CSSProperties}>
      <AppSidebar
        activeConversationId={conversation?.conversation_id}
        conversations={recents}
        newConversationDisabled={isBusy || loadState === "loading"}
        onNewConversation={() => void createConversation()}
        onSelectConversation={(conversationId) => void selectConversation(conversationId)}
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
                !conversation?.messages.length && !pendingMessage && busy !== "sending" && "justify-center",
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
                    <Welcome disabled={isBusy} onSuggestion={(value) => void submitTurn(value)} />
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
              </AnimatePresence>

              <AnimatePresence initial={false} mode="popLayout">
                {conversation && hasIntentSummary ? (
                  <ChatPresenceItem delay={arrivingAssistantMessageId ? 0.12 : 0} key={`intent-summary-${conversation.conversation_id}-${conversation.updated_at}`}>
                    <IntentSummary conversation={conversation} />
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

          <footer className="min-w-0 shrink-0 overflow-hidden border-t bg-panel px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:px-6">
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
                          : speech.listening
                            ? "Listening…"
                            : "Talk to TravelBot…"
                    }
                    value={composerValue}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <Button
                      aria-label={speech.listening ? "Stop dictation" : speech.supported ? "Dictate message" : "Dictation is not supported in this browser"}
                      aria-pressed={speech.listening}
                      className={cn("rounded-md", speech.listening && "bg-red-50 text-destructive hover:bg-red-100")}
                      disabled={!speech.supported || !conversation || (isBusy && !speech.listening)}
                      onClick={speech.toggle}
                      size="icon-sm"
                      title={speech.supported ? "Dictate message" : "Your browser does not support speech recognition"}
                      type="button"
                      variant="ghost"
                    >
                      {speech.listening ? <SquareIcon className="size-3.5 fill-current" /> : speech.supported ? <MicIcon /> : <MicOffIcon />}
                    </Button>
                    {speech.listening ? <span className="hidden items-center gap-1.5 text-[10px] text-destructive sm:inline-flex"><i className="size-1.5 animate-pulse rounded-full bg-current" />listening</span> : null}
                  </PromptInputTools>
                  <PromptInputSubmit disabled={!composerValue.trim() || !conversation || isBusy || loadState !== "ready"} status={busy === "sending" ? "submitted" : "ready"} />
                </PromptInputFooter>
              </PromptInput>
              <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1">
                <p className={cn("text-[10px]", speech.error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                  {speech.error ?? (speech.supported ? "Click the microphone to dictate. Review before sending." : "Enter sends · Shift+Enter adds a new line")}
                </p>
                <span className="hidden truncate font-mono text-[9px] text-muted-foreground sm:block">{shortId(apiUrl, 28, 0)}</span>
              </div>
            </div>
          </footer>
        </main>
        <OperationInspector busy={busy} conversation={conversation} />
      </SidebarInset>
    </SidebarProvider>
  );
}
