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
  BotIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleIcon,
  Clock3Icon,
  CopyIcon,
  CreditCardIcon,
  HandshakeIcon,
  HistoryIcon,
  MicIcon,
  MicOffIcon,
  PlaneIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SquareIcon,
  WalletCardsIcon,
  WifiOffIcon,
} from "lucide-react";
import Link from "next/link";

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
import {
  apiUrl,
  boundApi,
  BoundApiError,
  createRequestIdentity,
} from "@/lib/bound-api";
import { cn } from "@/lib/utils";
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
const RECENT_CONVERSATIONS_KEY = "bound.recent-conversations.v1";
const STARTER_PROMPTS = [
  "Quero ir de GRU para COR em 15 de setembro de 2026, uma pessoa, econômica, até US$ 150.",
  "Encontre um voo de São Paulo para Córdoba em 15 de setembro, por até US$ 150.",
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
  if (error instanceof BoundApiError) return error;
  return new BoundApiError({
    message: "Ocorreu um erro inesperado nesta conversa.",
    code: "unexpected_error",
  });
}

function readRecentIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_CONVERSATIONS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string").slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

function shortId(value: string, start = 10, end = 6) {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${end ? value.slice(-end) : ""}`;
}

const stateLabels: Record<TravelBotState, string> = {
  COLLECTING: "Coletando detalhes",
  READY_TO_SEARCH: "Pronto para buscar",
  AWAITING_OFFER_SELECTION: "Aguardando sua escolha",
  AWAITING_AUTHORITY_CONFIRMATION: "Confirmação necessária",
  READY_TO_PURCHASE: "Compra autorizada",
  EXECUTING: "Executando compra",
  COMPLETED: "Operação concluída",
  FAILED: "Operação interrompida",
};

const missingFieldLabels: Record<RequiredTravelIntentField, string> = {
  origin_iata: "origem",
  destination_iata: "destino",
  departure_date: "data",
  passenger_count: "passageiros",
  cabin: "cabine",
  max_total_budget: "orçamento",
};

function conversationTitle(conversation: TravelBotConversation) {
  const { origin_iata: origin, destination_iata: destination } = conversation.intent;
  if (origin && destination) return `${origin} → ${destination}`;
  const firstMessage = conversation.messages.find(({ role }) => role === "USER");
  if (!firstMessage) return "Nova conversa";
  return firstMessage.content.length > 34
    ? `${firstMessage.content.slice(0, 34)}…`
    : firstMessage.content;
}

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
    recognition.lang = "pt-BR";
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
        ? "Permita o acesso ao microfone para ditar uma mensagem."
        : event.error === "no-speech"
          ? "Não ouvi nenhuma fala. Tente novamente."
          : "Não foi possível reconhecer sua fala agora.";
      setError(label);
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Não foi possível iniciar o microfone.");
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
                identificado
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

function UserMessage({ message }: { message: Pick<TravelBotMessage, "content" | "created_at"> }) {
  return (
    <Message from="user">
      <MessageContent className="max-w-[88%] whitespace-pre-wrap rounded-lg rounded-br-sm border bg-secondary px-3.5 py-2.5 text-[13px] leading-6">
        {message.content}
        <time className="self-end text-[9px] text-muted-foreground" dateTime={message.created_at}>
          {formatTime(message.created_at)}
        </time>
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
        Para onde vamos, Marta?
      </h1>
      <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
        Conte os detalhes da viagem. O TravelBot pode buscar, comparar e preparar a compra — sempre pedindo sua confirmação antes de movimentar dinheiro.
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

function OfferCard({
  offer,
  disabled,
  onSelect,
}: {
  offer: OfferCandidate;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <article className="overflow-hidden rounded-lg border bg-card shadow-[0_6px_24px_rgb(0_0_0/0.06)]">
      <header className="flex items-center justify-between border-b bg-panel px-4 py-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          <PlaneIcon className="size-3.5 text-blue-700" />
          VuelaYa
        </span>
        <span className="panel-label">Oferta do merchant</span>
      </header>
      <div className="grid gap-5 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <strong className="font-serif text-3xl font-normal">{offer.fulfillment.origin}</strong>
            <span className="h-px w-10 bg-border" aria-hidden="true" />
            <PlaneIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="h-px w-10 bg-border" aria-hidden="true" />
            <strong className="font-serif text-3xl font-normal">{offer.fulfillment.destination}</strong>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDaysIcon className="size-3" />{formatDate(offer.fulfillment.departure_at)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3Icon className="size-3" />{formatTime(offer.fulfillment.departure_at)}–{formatTime(offer.fulfillment.arrival_at)}</span>
            <span>{offer.fulfillment.cabin === "ECONOMY" ? "Econômica" : offer.fulfillment.cabin}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-5 border-t pt-4 sm:block sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5 sm:text-right">
          <div>
            <span className="block text-[10px] text-muted-foreground">Total por pessoa</span>
            <strong className="mt-0.5 block text-lg tabular-nums">{formatMoney(offer.total.amount, offer.total.currency)}</strong>
          </div>
          <Button className="mt-0 sm:mt-3" disabled={disabled} onClick={onSelect} size="sm">
            Selecionar <ChevronRightIcon />
          </Button>
        </div>
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
  return (
    <article className="overflow-hidden rounded-lg border border-blue-200 bg-card shadow-[0_6px_24px_rgb(0_0_0/0.06)]">
      <div className="h-1 bg-blue-600" />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700">
            <ShieldCheckIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="panel-label">Sua decisão</p>
            <h2 className="mt-1 font-serif text-2xl">Autorizar esta compra?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              O TravelBot pede permissão para pagar <strong className="text-foreground">{formatMoney(approval.amount, approval.currency)}</strong> à VuelaYa. Nada será movimentado sem sua confirmação.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-2 border-y py-3 text-xs sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Merchant</dt><dd className="mt-0.5 font-mono">{approval.merchant_id}</dd></div>
          <div><dt className="text-muted-foreground">Mandato</dt><dd className="mt-0.5 font-mono">{shortId(approval.mandate_id)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={disabled} onClick={() => onDecision(false)} variant="outline">Não autorizar</Button>
          <Button disabled={disabled} onClick={() => onDecision(true)}>
            <CheckIcon /> Autorizar {formatMoney(approval.amount, approval.currency)}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ErrorNotice({ error, onRetry }: { error: BoundApiError; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3.5 text-sm" role="alert">
      {error.offline ? <WifiOffIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div className="min-w-0 flex-1">
        <strong className="block text-xs">Não consegui concluir</strong>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{error.message}</p>
        {error.correlationId ? <code className="mt-1 block break-all text-[10px] text-muted-foreground">{error.correlationId}</code> : null}
      </div>
      {onRetry ? <Button onClick={onRetry} size="sm" variant="outline"><RefreshCwIcon />Tentar de novo</Button> : null}
    </div>
  );
}

function OperationInspector({ conversation, busy }: { conversation?: TravelBotConversation; busy: BusyState }) {
  const state = conversation?.state ?? "COLLECTING";
  const operation = conversation?.operation;
  const steps = [
    { label: "Entender pedido", done: Boolean(conversation && conversation.missing_fields.length === 0) },
    { label: "Encontrar opções", done: Boolean(conversation?.offers.length) },
    { label: "Fixar checkout", done: Boolean(operation?.checkout_id) },
    { label: "Obter autoridade", done: Boolean(operation?.mandate_id) },
    { label: "Comprar e emitir", done: Boolean(operation?.receipt_id) },
  ];
  const firstIncomplete = steps.findIndex(({ done }) => !done);
  const activeIndex = firstIncomplete === -1 ? steps.length - 1 : firstIncomplete;
  const intent = conversation?.intent;

  return (
    <aside className="hidden w-[19rem] shrink-0 flex-col border-l bg-panel xl:flex" aria-label="Detalhes da operação">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <strong className="text-xs font-medium">Detalhes</strong>
        {busy ? <span className="inline-flex items-center gap-1.5 text-[10px] text-blue-700"><i className="size-1.5 animate-pulse rounded-full bg-current" />trabalhando</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b p-4">
          <div className="mb-4 flex items-center justify-between"><h2 className="panel-label">Progresso</h2><span className="text-[10px] text-muted-foreground">{stateLabels[state]}</span></div>
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
          <h2 className="panel-label">Pedido compreendido</h2>
          {intent && conversation?.missing_fields.length !== 6 ? (
            <dl className="mt-3 grid gap-2.5 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Rota</dt><dd className="font-medium">{intent.origin_iata ?? "—"} → {intent.destination_iata ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Data</dt><dd className="font-medium">{intent.departure_date ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Passageiros</dt><dd className="font-medium">{intent.passenger_count ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Cabine</dt><dd className="font-medium">{intent.cabin ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Limite</dt><dd className="font-medium tabular-nums">{intent.max_total_budget ? formatMoney(intent.max_total_budget.amount, intent.max_total_budget.currency) : "—"}</dd></div>
            </dl>
          ) : <p className="mt-3 text-xs leading-5 text-muted-foreground">Os detalhes aparecem aqui conforme você conversa.</p>}
          {conversation?.missing_fields.length ? (
            <p className="mt-3 border-t pt-3 text-[10px] leading-4 text-muted-foreground">
              Falta: {conversation.missing_fields.map((field) => missingFieldLabels[field]).join(", ")}.
            </p>
          ) : null}
        </section>

        {intent?.max_total_budget ? (
          <section className="border-b p-4">
            <div className="mb-3 flex items-center gap-2"><WalletCardsIcon className="size-3.5 text-blue-700" /><h2 className="panel-label">Limite desta compra</h2></div>
            <strong className="block text-xl tabular-nums">{formatMoney(intent.max_total_budget.amount, intent.max_total_budget.currency)}</strong>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">É um teto proposto. Não representa dinheiro gasto ou reservado.</p>
          </section>
        ) : null}

        {operation && Object.values(operation).some(Boolean) ? (
          <section className="p-4">
            <h2 className="panel-label">Evidência</h2>
            <dl className="mt-3 grid gap-3 text-[10px]">
              {operation.checkout_id ? <div><dt className="text-muted-foreground">Checkout</dt><dd className="mt-0.5 break-all font-mono">{operation.checkout_id}</dd></div> : null}
              {operation.mandate_id ? <div><dt className="text-muted-foreground">Mandato</dt><dd className="mt-0.5 break-all font-mono">{operation.mandate_id}</dd></div> : null}
              {operation.authorization_id ? <div><dt className="text-muted-foreground">Autorização</dt><dd className="mt-0.5 break-all font-mono">{operation.authorization_id}</dd></div> : null}
              {operation.receipt_id ? <div><dt className="text-muted-foreground">Recibo</dt><dd className="mt-0.5 break-all font-mono">{operation.receipt_id}</dd></div> : null}
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
      localStorage.setItem(RECENT_CONVERSATIONS_KEY, JSON.stringify(updated.map(({ conversation_id }) => conversation_id)));
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

        const ids = readRecentIds();
        const loaded = await Promise.allSettled(ids.map((id) => boundApi.getConversation(id, controller.signal)));
        const conversations = loaded
          .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof boundApi.getConversation>>> => result.status === "fulfilled")
          .map((result) => result.value.data)
          .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
        if (conversations.length) {
          setRecents(conversations);
          setConversation(conversations[0]);
          setLastCorrelationId(messageCorrelationId(conversations[0]) ?? agentResult.correlationId ?? healthResult.correlationId);
          localStorage.setItem(RECENT_CONVERSATIONS_KEY, JSON.stringify(conversations.map(({ conversation_id }) => conversation_id)));
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
  const showOffers = conversation?.state === "AWAITING_OFFER_SELECTION" && conversation.offers.length > 0;
  const showApproval = conversation?.state === "AWAITING_AUTHORITY_CONFIRMATION" && Boolean(conversation.operation.pending_approval);
  const isBusy = busy !== null;

  return (
    <SidebarProvider className="h-dvh min-h-[38rem] overflow-hidden" style={{ "--sidebar-width": "15.5rem" } as CSSProperties}>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="border-b p-3">
          <div className="flex h-8 items-center justify-between px-1">
            <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-foreground text-background"><ShieldCheckIcon className="size-3.5" /></span><strong className="text-sm">Bound</strong></div>
          </div>
          <Button className="mt-2 justify-start" disabled={isBusy || loadState === "loading"} onClick={() => void createConversation()} variant="outline">
            <PlusIcon /> Nova conversa
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Sua conta</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton render={<Link href="/metodos-de-pagamento" />} tooltip="Métodos de pagamento">
                    <CreditCardIcon />
                    <span>Métodos de pagamento</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton render={<Link href="/compras" />} tooltip="Compras">
                    <HistoryIcon />
                    <span>Compras</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton render={<Link href="/lojas-conectadas" />} tooltip="Lojas conectadas">
                    <HandshakeIcon />
                    <span>Lojas conectadas</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Recentes</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recents.length ? recents.map((recent) => (
                  <SidebarMenuItem key={recent.conversation_id}>
                    <SidebarMenuButton
                      className="h-auto items-start py-2.5"
                      isActive={recent.conversation_id === conversation?.conversation_id}
                      onClick={() => void selectConversation(recent.conversation_id)}
                    >
                      <BotIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-xs font-medium">{conversationTitle(recent)}</span>
                        <span className="truncate text-[10px] text-muted-foreground">{stateLabels[recent.state]}</span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )) : <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">Sua conversa atual aparecerá aqui.</p>}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t p-3">
          <div className="flex items-center gap-2.5 rounded-md p-1">
            <span className="grid size-8 place-items-center rounded-full border bg-background text-xs font-semibold">M</span>
            <div className="min-w-0"><strong className="block truncate text-xs">Marta</strong><span className="block truncate text-[10px] text-muted-foreground">Principal do mandato</span></div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

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
                  {loadState === "ready" ? stateLabels[conversation?.state ?? "COLLECTING"] : loadState === "error" ? "API indisponível" : "Conectando"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agent ? <span className="hidden items-center gap-1.5 text-[10px] text-emerald-700 sm:flex"><ShieldCheckIcon className="size-3" />{agent.display_name} identificado</span> : null}
              {lastCorrelationId ? (
                <Button aria-label="Copiar correlation ID" onClick={() => void navigator.clipboard.writeText(lastCorrelationId)} size="icon-sm" title={`Correlation ID: ${lastCorrelationId}`} variant="ghost"><CopyIcon /></Button>
              ) : null}
            </div>
          </header>

          <Conversation className="min-h-0 bg-workspace">
            <ConversationContent className={cn("mx-auto min-h-full w-full max-w-3xl gap-7 px-4 py-7 md:px-8 md:py-10", !conversation?.messages.length && "justify-center")}>
              {loadState === "loading" ? (
                <div className="my-auto flex items-center justify-center"><Shimmer className="text-sm text-muted-foreground">Abrindo sua conversa segura…</Shimmer></div>
              ) : null}

              {loadState === "error" && !conversation ? <ErrorNotice error={error ?? new BoundApiError({ message: "A API do Bound não respondeu.", offline: true })} onRetry={() => void createConversation()} /> : null}

              {loadState === "ready" && conversation && !conversation.messages.length ? <Welcome disabled={isBusy} onSuggestion={(value) => void submitTurn(value)} /> : null}

              {conversation?.messages.map((message) => message.role === "USER" ? <UserMessage key={message.message_id} message={message} /> : <AssistantMessage key={message.message_id} message={message} />)}

              {pendingMessage && lastMessage?.content !== pendingMessage ? (
                <UserMessage message={{ content: pendingMessage, created_at: new Date().toISOString() }} />
              ) : null}

              {busy === "sending" ? (
                <div className="flex items-center gap-3 pl-1" aria-live="polite">
                  <span className="grid size-7 place-items-center text-blue-700"><BotIcon className="size-4" /></span>
                  <Shimmer className="text-xs text-muted-foreground">TravelBot está trabalhando…</Shimmer>
                </div>
              ) : null}

              {showOffers ? (
                <div className="grid gap-3">
                  {conversation.offers.map((offer) => <OfferCard disabled={isBusy} key={offer.offer_id} offer={offer} onSelect={() => void submitTurn(`Seleciono a oferta ${offer.offer_id}.`)} />)}
                </div>
              ) : null}

              {showApproval ? <ApprovalCard conversation={conversation} disabled={isBusy} onDecision={(approved) => void submitTurn(approved ? "Confirmo e autorizo esta compra." : "Não autorizo esta compra.")} /> : null}

              {error && conversation ? <ErrorNotice error={error} onRetry={failedTurn ? () => void submitTurn(failedTurn.text, failedTurn.identity) : undefined} /> : null}
            </ConversationContent>
            <ConversationScrollButton aria-label="Ir para o fim da conversa" />
          </Conversation>

          <footer className="shrink-0 border-t bg-panel px-3 py-2.5 md:px-6">
            <div className="mx-auto max-w-3xl">
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputBody>
                  <PromptInputTextarea
                    className="min-h-12"
                    disabled={!conversation || isBusy || loadState !== "ready"}
                    onChange={(event) => setComposerValue(event.currentTarget.value)}
                    placeholder={speech.listening ? "Estou ouvindo…" : "Converse com o TravelBot…"}
                    value={composerValue}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <Button
                      aria-label={speech.listening ? "Parar ditado" : speech.supported ? "Ditar mensagem" : "Ditado não suportado neste navegador"}
                      aria-pressed={speech.listening}
                      className={cn("rounded-md", speech.listening && "bg-red-50 text-destructive hover:bg-red-100")}
                      disabled={!speech.supported || !conversation || (isBusy && !speech.listening)}
                      onClick={speech.toggle}
                      size="icon-sm"
                      title={speech.supported ? "Ditar mensagem" : "Seu navegador não oferece reconhecimento de voz"}
                      type="button"
                      variant="ghost"
                    >
                      {speech.listening ? <SquareIcon className="size-3.5 fill-current" /> : speech.supported ? <MicIcon /> : <MicOffIcon />}
                    </Button>
                    {speech.listening ? <span className="hidden items-center gap-1.5 text-[10px] text-destructive sm:inline-flex"><i className="size-1.5 animate-pulse rounded-full bg-current" />ouvindo</span> : null}
                  </PromptInputTools>
                  <PromptInputSubmit disabled={!composerValue.trim() || !conversation || isBusy || loadState !== "ready"} status={busy === "sending" ? "submitted" : "ready"} />
                </PromptInputFooter>
              </PromptInput>
              <div className="mt-1.5 flex min-h-4 items-center justify-between gap-3 px-1">
                <p className={cn("text-[10px]", speech.error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
                  {speech.error ?? (speech.supported ? "Clique no microfone para ditar. Revise antes de enviar." : "Enter envia · Shift+Enter quebra a linha")}
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
