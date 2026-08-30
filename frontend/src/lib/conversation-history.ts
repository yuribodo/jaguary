import type { TravelBotConversation, TravelBotState } from "@/lib/contracts";

export const RECENT_CONVERSATIONS_KEY = "bound.recent-conversations.v1";
export const MAX_RECENT_CONVERSATIONS = 8;

export const conversationStateLabels: Record<TravelBotState, string> = {
  COLLECTING: "Collecting details",
  READY_TO_SEARCH: "Ready to search",
  AWAITING_OFFER_SELECTION: "Preparing the best option",
  AWAITING_AUTHORITY_CONFIRMATION: "Confirmation required",
  READY_TO_PURCHASE: "Purchase authorized",
  EXECUTING: "Executing purchase",
  COMPLETED: "Operation completed",
  FAILED: "Operation interrupted",
};

export function conversationTitle(conversation: TravelBotConversation) {
  const { origin_iata: origin, destination_iata: destination } = conversation.intent;
  if (origin && destination) return `${origin} → ${destination}`;

  const firstMessage = conversation.messages.find(({ role }) => role === "USER");
  if (!firstMessage) return "New conversation";

  return firstMessage.content.length > 34
    ? `${firstMessage.content.slice(0, 34)}…`
    : firstMessage.content;
}

export function readRecentConversationIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_CONVERSATIONS_KEY) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === "string")
          .slice(0, MAX_RECENT_CONVERSATIONS)
      : [];
  } catch {
    return [];
  }
}

export function writeRecentConversationIds(ids: string[]) {
  localStorage.setItem(
    RECENT_CONVERSATIONS_KEY,
    JSON.stringify([...new Set(ids)].slice(0, MAX_RECENT_CONVERSATIONS)),
  );
}

export function rememberRecentConversationId(conversationId: string) {
  writeRecentConversationIds([
    conversationId,
    ...readRecentConversationIds().filter((id) => id !== conversationId),
  ]);
}
