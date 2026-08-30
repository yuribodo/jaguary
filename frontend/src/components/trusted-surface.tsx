"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRightIcon,
  BotIcon,
  CalendarDaysIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleIcon,
  CopyIcon,
  InfoIcon,
  MicIcon,
  MicOffIcon,
  PlaneIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  WalletCardsIcon,
  WifiOffIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

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
import { cn } from "@/lib/utils";
import {
  conversationStateLabels,
  conversationTitle,
  readRecentConversationIds,
  writeRecentConversationIds,
} from "@/lib/conversation-history";
import type {
  AgentIdentity,
  OfferCandidate,
  RequiredTravelIntentField,
  TravelBotConversation,
  TravelBotMessage,
  TravelBotState,
} from "@/lib/contracts";

const PRINCIPAL_ID = "principal_marta";
const TRAVELBOT_ID = "agent_travelbot";
const STARTER_PROMPTS = [
  "I want to travel from GRU to COR on September 15, 2026, one passenger, economy, up to US$150.",
  "Find a flight from São Paulo to Córdoba on September 15 for up to US$150.",
];

type LoadState = "loading" | "ready" | "error";
type BusyState = "creating" | "switching" | "sending" | null;
type FailedTurn = {
  text: string;
  identity: ReturnType<typeof createRequestIdentity>;
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

function formatDuration(minutes?: number) {
  if (minutes === undefined) return undefined;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}min` : `${hours}h`;
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
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 5 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.2 }}
    >
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
    </motion.div>
  );
}

function UserMessage({
  message,
  status,
}: {
  message: Pick<TravelBotMessage, "content" | "created_at">;
  status?: "sending" | "sent";
}) {
  return (
    <Message from="user">
      <MessageContent className="max-w-[92%] whitespace-pre-wrap rounded-xl rounded-br-sm border bg-secondary px-3.5 py-2.5 text-[13px] leading-6 sm:max-w-[82%]">
        {message.content}
        <span className="flex items-center justify-end gap-1.5 text-[9px] text-muted-foreground">
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
          <span aria-live="polite">{status === "sending" ? "sending…" : "sent"}</span>
        </span>
      </MessageContent>
    </Message>
  );
}

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
  return (
    <section className="rounded-xl border bg-panel/70 p-3.5" aria-label="Understood trip request">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold"><CheckIcon className="size-3.5 text-emerald-700" />I understood your trip</span>
        {conversation.missing_fields.length ? <span className="text-[10px] text-amber-700">{conversation.missing_fields.length} details missing</span> : <span className="text-[10px] text-emerald-700">Ready to search</span>}
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
    ? "Locking the offer and preparing your review…"
    : state === "AWAITING_AUTHORITY_CONFIRMATION"
      ? "Validating the authorization and processing securely…"
      : "Checking available flights on Google Flights…";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5" aria-live="polite" role="status">
      <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-blue-700 shadow-sm">
        <SearchIcon className="size-4" />
        <i className="absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full bg-blue-600 ring-2 ring-white" />
      </span>
      <div><strong className="block text-xs">{label}</strong><p className="mt-1 text-[11px] leading-5 text-muted-foreground">This may take a few seconds. You can stay on this screen.</p></div>
    </div>
  );
}

function OfferCard({
  offer,
  passengerCount,
}: {
  offer: OfferCandidate;
  passengerCount: number;
}) {
  const fulfillment = offer.fulfillment;
  const airline = fulfillment.airline_names?.join(" + ") ?? "Airline";
  const partyTotal = offer.total.amount * passengerCount;
  const officialHref = officialFlightHref(offer);
  const isExternal = officialHref.startsWith("http");
  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-xl border border-blue-200 bg-card shadow-[0_8px_30px_rgb(22_31_55/0.07)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-panel px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-medium">
          <i className="size-2 rounded-full bg-emerald-600" aria-hidden="true" />
          {offer.source === "GOOGLE_FLIGHTS" ? "Google Flights" : "VuelaYa"} · checked {freshnessLabel(offer.observed_at)}
        </span>
        <span className="panel-label text-blue-700">TravelBot&apos;s choice</span>
      </header>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="mb-1 block text-[9px] font-medium tracking-[0.12em] text-emerald-800 uppercase">Best matching available flight</span>
            <strong className="block truncate text-sm">{airline}</strong>
            <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{fulfillment.flight_numbers?.join(" · ") ?? "Number confirmed at checkout"}</span>
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-blue-700 hover:underline"
            href={officialHref}
            {...(isExternal ? { rel: "noreferrer", target: "_blank" } : {})}
          >
            View official flight <ArrowUpRightIcon className="size-3" />
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
          <div className="min-w-0">
            <strong className="font-serif text-3xl font-normal">{formatLocalTime(fulfillment.departure_local, fulfillment.departure_at)}</strong>
            <span className="mt-0.5 block text-xs font-semibold">{fulfillment.origin}</span>
          </div>
          <div className="grid min-w-20 place-items-center text-center sm:min-w-24">
            <span className="text-[9px] text-muted-foreground">{formatDuration(fulfillment.duration_minutes) ?? "Duration"}</span>
            <span className="my-1 flex w-full items-center"><i className="h-px flex-1 bg-border" /><PlaneIcon className="mx-1.5 size-3.5 text-blue-700" /><i className="h-px flex-1 bg-border" /></span>
            <span className="text-[9px] font-medium text-muted-foreground">{stopLabel(fulfillment.stops) ?? cabinLabel(fulfillment.cabin)}</span>
          </div>
          <div className="min-w-0 text-right">
            <strong className="font-serif text-3xl font-normal">{formatLocalTime(fulfillment.arrival_local, fulfillment.arrival_at)}</strong>
            <span className="mt-0.5 block text-xs font-semibold">{fulfillment.destination}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CalendarDaysIcon className="size-3" />{formatLocalDate(fulfillment.departure_local, fulfillment.departure_at)}</span>
          <span>{cabinLabel(fulfillment.cabin)}</span>
          <span className="inline-flex items-center gap-1.5"><UsersIcon className="size-3" />{passengerCount} {passengerCount === 1 ? "traveler" : "travelers"}</span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <span className="block text-[10px] text-muted-foreground">Total for {passengerCount}</span>
            <strong className="mt-0.5 block text-xl tabular-nums">{formatMoney(partyTotal, offer.total.currency)}</strong>
            {passengerCount > 1 ? <span className="text-[9px] text-muted-foreground">{formatMoney(offer.total.amount, offer.total.currency)} per person</span> : null}
          </div>
          <span className="text-[9px] text-muted-foreground">Available until {formatTime(offer.available_until)}</span>
        </div>
        <p className="mt-4 border-t pt-3 text-[11px] leading-5 text-muted-foreground">TravelBot compared the compatible inventory and selected this option. Your explicit approval is still required before payment.</p>
        <p className="mt-3 flex items-start gap-1.5 text-[9px] leading-4 text-muted-foreground"><InfoIcon className="mt-0.5 size-3 shrink-0" />Observed price, subject to confirmation at checkout.</p>
      </div>
    </article>
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
  return (
    <article className="overflow-hidden rounded-xl border border-blue-200 bg-card shadow-[0_8px_30px_rgb(22_31_55/0.08)]">
      <div className="h-1 bg-blue-600" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700">
            <ShieldCheckIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="panel-label">Your decision</p>
            <h2 className="mt-1 font-serif text-2xl">Approve TravelBot&apos;s choice?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Review the details below. TravelBot can pay <strong className="text-foreground">{formatMoney(approval.amount, approval.currency)}</strong> to VuelaYa only after your confirmation.
            </p>
          </div>
        </div>
        {offer ? (
          <div className="mt-5 rounded-lg bg-panel p-3.5">
            <div className="flex items-start justify-between gap-4">
              <div><strong className="text-sm">{offer.fulfillment.origin} → {offer.fulfillment.destination}</strong><p className="mt-0.5 text-[10px] text-muted-foreground">{offer.fulfillment.airline_names?.join(" + ") ?? "VuelaYa"} · {offer.fulfillment.flight_numbers?.join(" · ")}</p></div>
              <strong className="text-sm tabular-nums">{formatMoney(approval.amount, approval.currency)}</strong>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-[11px] sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Date</dt><dd className="mt-0.5 font-medium">{formatLocalDate(offer.fulfillment.departure_local, offer.fulfillment.departure_at)}</dd></div>
              <div><dt className="text-muted-foreground">Local time</dt><dd className="mt-0.5 font-medium">{formatLocalTime(offer.fulfillment.departure_local, offer.fulfillment.departure_at)}–{formatLocalTime(offer.fulfillment.arrival_local, offer.fulfillment.arrival_at)}</dd></div>
              <div><dt className="text-muted-foreground">Travelers</dt><dd className="mt-0.5 font-medium">{travelers}</dd></div>
              <div><dt className="text-muted-foreground">Cabin</dt><dd className="mt-0.5 font-medium">{cabinLabel(offer.fulfillment.cabin)}</dd></div>
            </dl>
          </div>
        ) : null}
        <dl className="mt-3 grid gap-2 border-y py-3 text-[10px] sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Recipient</dt><dd className="mt-0.5 font-mono">{approval.merchant_id}</dd></div>
          <div><dt className="text-muted-foreground">Limited authority</dt><dd className="mt-0.5 font-mono">{shortId(approval.mandate_id)}</dd></div>
        </dl>
        <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-muted-foreground"><ShieldCheckIcon className="mt-0.5 size-3 shrink-0 text-emerald-700" />One-time use, limited to this flight and amount. No money has moved yet.</p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button className="h-11" disabled={disabled} onClick={() => onDecision(false)} variant="outline">Do not authorize</Button>
          <Button className="h-11" disabled={disabled} onClick={() => onDecision(true)}>
            <CheckIcon /> Authorize {formatMoney(approval.amount, approval.currency)}
          </Button>
        </div>
      </div>
    </article>
  );
}

function PurchaseReceipt({ conversation }: { conversation: TravelBotConversation }) {
  if (conversation.state !== "COMPLETED" || !conversation.operation.receipt_id) return null;
  const offer = conversation.offers.find(({ offer_id: offerId }) => offerId === conversation.intent.selected_offer_id);
  if (!offer) return null;
  const travelers = conversation.intent.passenger_count ?? 1;
  return (
    <article className="overflow-hidden rounded-xl border border-emerald-200 bg-card shadow-[0_8px_30px_rgb(22_31_55/0.07)]" aria-label="Purchase confirmed">
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/70 px-4 py-3.5">
        <span className="grid size-8 place-items-center rounded-full bg-emerald-700 text-white"><CheckIcon className="size-4" /></span>
        <div><strong className="block text-sm">Purchase confirmed</strong><span className="text-[10px] text-emerald-800">Receipt issued and saved in Bound</span></div>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div><p className="panel-label">Your flight</p><h2 className="mt-1 font-serif text-2xl">{offer.fulfillment.origin} → {offer.fulfillment.destination}</h2><p className="mt-1 text-xs text-muted-foreground">{offer.fulfillment.airline_names?.join(" + ")} · {offer.fulfillment.flight_numbers?.join(" · ")}</p></div>
          <ReceiptTextIcon className="size-5 text-emerald-700" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-y py-3 text-xs sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Date</dt><dd className="mt-1 font-medium">{formatLocalDate(offer.fulfillment.departure_local, offer.fulfillment.departure_at)}</dd></div>
          <div><dt className="text-muted-foreground">Departure</dt><dd className="mt-1 font-medium">{formatLocalTime(offer.fulfillment.departure_local, offer.fulfillment.departure_at)}</dd></div>
          <div><dt className="text-muted-foreground">Travelers</dt><dd className="mt-1 font-medium">{travelers}</dd></div>
          <div><dt className="text-muted-foreground">Total paid</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(offer.total.amount * travelers, offer.total.currency)}</dd></div>
        </dl>
        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-muted-foreground"><span>Receipt</span><code className="truncate">{shortId(conversation.operation.receipt_id, 18, 8)}</code></div>
      </div>
    </article>
  );
}

function ErrorNotice({ error, onRetry }: { error: BoundApiError; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-sm" role="alert">
      {error.offline ? <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div className="min-w-0 flex-1">
        <strong className="block text-xs">{error.offline ? "Bound API unavailable" : "Could not complete"}</strong>
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

  const createConversation = useCallback(async () => {
    setBusy("creating");
    setError(undefined);
    const identity = createRequestIdentity("conversation_create");
    try {
      const result = await boundApi.createConversation(
        { principal_id: PRINCIPAL_ID, agent_id: TRAVELBOT_ID },
        identity,
      );
      rememberConversation(result.data);
      setLastCorrelationId(result.correlationId ?? identity.correlationId);
      setComposerValue("");
      setPendingMessage(undefined);
      setFailedTurn(undefined);
      setLoadState("ready");
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
      setLoadState("error");
    } finally {
      setBusy(null);
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
          setConversation(selectedConversation);
          setLastCorrelationId(messageCorrelationId(selectedConversation) ?? agentResult.correlationId ?? healthResult.correlationId);
          writeRecentConversationIds(conversations.map(({ conversation_id }) => conversation_id));
          setLoadState("ready");
          return;
        }
        await createConversation();
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
    try {
      const result = await boundApi.getConversation(conversationId);
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
    identity = createRequestIdentity("conversation_message"),
  ) => {
    if (!conversation || busy || !text.trim()) return;
    const cleanText = text.trim();
    setBusy("sending");
    setError(undefined);
    setFailedTurn(undefined);
    setPendingMessage(cleanText);
    setComposerValue("");
    try {
      const result = await boundApi.postConversationMessage(conversation.conversation_id, cleanText, identity);
      rememberConversation(result.data);
      setLastCorrelationId(result.correlationId ?? identity.correlationId);
      setPendingMessage(undefined);
    } catch (caught) {
      const apiError = asApiError(caught);
      setError(apiError);
      setFailedTurn({ text: cleanText, identity });
      setLastCorrelationId(apiError.correlationId ?? identity.correlationId);
    } finally {
      setBusy(null);
    }
  }, [busy, conversation, rememberConversation]);

  function handleSubmit(message: PromptInputMessage) {
    void submitTurn(message.text);
  }

  const updateComposer = useCallback((value: string) => setComposerValue(value), []);
  const speech = useSpeechInput(composerValue, updateComposer, busy !== null || loadState !== "ready");
  const lastMessage = conversation?.messages.at(-1);
  const selectedOffer = conversation?.offers.find(({ offer_id: offerId }) => (
    offerId === conversation.intent.selected_offer_id
  ));
  const showChosenOffer = conversation?.state === "AWAITING_AUTHORITY_CONFIRMATION" && selectedOffer !== undefined;
  const showApproval = conversation?.state === "AWAITING_AUTHORITY_CONFIRMATION" && Boolean(conversation.operation.pending_approval);
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

          <Conversation aria-busy={busy === "sending"} className="min-h-0 min-w-0 overflow-x-hidden bg-workspace">
            <ConversationContent className={cn("mx-auto min-h-full min-w-0 w-full max-w-3xl gap-7 overflow-x-hidden px-4 py-7 md:px-8 md:py-10", !conversation?.messages.length && "justify-center")}>
              {loadState === "loading" ? (
                <div className="my-auto flex items-center justify-center"><Shimmer className="text-sm text-muted-foreground">Opening your secure conversation…</Shimmer></div>
              ) : null}

              {loadState === "error" && !conversation ? <ErrorNotice error={error ?? new BoundApiError({ message: "The Bound API did not respond.", offline: true })} onRetry={() => void createConversation()} /> : null}

              {loadState === "ready" && conversation && !conversation.messages.length ? <Welcome disabled={isBusy} onSuggestion={(value) => void submitTurn(value)} /> : null}

              {conversation?.messages.map((message) => message.role === "USER" ? <UserMessage key={message.message_id} message={message} status="sent" /> : <AssistantMessage key={message.message_id} message={message} />)}

              {conversation?.messages.length ? <IntentSummary conversation={conversation} /> : null}

              {pendingMessage && lastMessage?.content !== pendingMessage ? (
                <UserMessage message={{ content: pendingMessage, created_at: new Date().toISOString() }} status="sending" />
              ) : null}

              {busy === "sending" ? <WorkingStatus state={conversation?.state ?? "COLLECTING"} /> : null}

              {showChosenOffer ? <OfferCard offer={selectedOffer} passengerCount={conversation.intent.passenger_count ?? 1} /> : null}

              {showApproval ? <ApprovalCard conversation={conversation} disabled={isBusy} onDecision={(approved) => void submitTurn(approved ? "I confirm and authorize this purchase." : "I do not authorize this purchase.")} /> : null}

              {conversation ? <PurchaseReceipt conversation={conversation} /> : null}

              {error && conversation ? <ErrorNotice error={error} onRetry={failedTurn ? () => void submitTurn(failedTurn.text, failedTurn.identity) : undefined} /> : null}
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
                        ? "Waiting for Bound…"
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
