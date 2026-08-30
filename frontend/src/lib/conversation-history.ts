import type { TravelBotConversation, TravelBotState } from "@/lib/contracts";

export const RECENT_CONVERSATIONS_KEY = "bound.recent-conversations.v1";
export const MAX_RECENT_CONVERSATIONS = 8;

function recentConversationsKey(principalId: string) {
  return `${RECENT_CONVERSATIONS_KEY}.${principalId}`;
}

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

export function readRecentConversationIds(principalId: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(recentConversationsKey(principalId)) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter((id): id is string => typeof id === "string")
          .slice(0, MAX_RECENT_CONVERSATIONS)
      : [];
  } catch {
    return [];
  }
}

export function writeRecentConversationIds(principalId: string, ids: string[]) {
  localStorage.setItem(
    recentConversationsKey(principalId),
    JSON.stringify([...new Set(ids)].slice(0, MAX_RECENT_CONVERSATIONS)),
  );
}

export function rememberRecentConversationId(principalId: string, conversationId: string) {
  writeRecentConversationIds(principalId, [
    conversationId,
    ...readRecentConversationIds(principalId).filter((id) => id !== conversationId),
  ]);
}
