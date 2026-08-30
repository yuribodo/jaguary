"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { AppSidebar, type AccountPage } from "@/components/app-sidebar";
import { AuthenticatedPage, useAuthenticatedPrincipalSession } from "@/components/authenticated-page";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { boundApi, createRequestIdentity } from "@/lib/bound-api";
import {
  readRecentConversationIds,
  rememberRecentConversationId,
} from "@/lib/conversation-history";
import type { TravelBotConversation } from "@/lib/contracts";

const TRAVELBOT_ID = "agent_travelbot";

type AccountPageShellProps = {
  activePage: AccountPage;
  children: ReactNode;
};

export function AccountPageShell(props: AccountPageShellProps) {
  if (process.env.NODE_ENV === "development") return <WorkspaceAccountPageShell {...props} />;
  return <AuthenticatedPage><WorkspaceAccountPageShell {...props} /></AuthenticatedPage>;
}

function WorkspaceAccountPageShell({
  activePage,
  children,
}: AccountPageShellProps) {
  const router = useRouter();
  const principalSession = useAuthenticatedPrincipalSession();
  const principalId = principalSession.principal.principal_id;
  const [recents, setRecents] = useState<TravelBotConversation[]>([]);
  const [recentMessage, setRecentMessage] = useState("Loading conversations…");
  const [creatingConversation, setCreatingConversation] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecents() {
      const ids = readRecentConversationIds(principalId);
      if (!ids.length) {
        setRecentMessage("Your conversations will appear here.");
        return;
      }

      const loaded = await Promise.allSettled(
        ids.map((id) => boundApi.getConversation(id, controller.signal)),
      );
      if (controller.signal.aborted) return;

      const conversations = loaded
        .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof boundApi.getConversation>>> => result.status === "fulfilled")
        .map((result) => result.value.data)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

      setRecents(conversations);
      setRecentMessage(
        conversations.length
          ? ""
          : "Conversations are temporarily unavailable.",
      );
    }

    void loadRecents();
    return () => controller.abort();
  }, [principalId]);

  const createConversation = useCallback(async () => {
    if (creatingConversation) return;
    setCreatingConversation(true);
    setRecentMessage("Creating conversation…");

    try {
      const result = await boundApi.createConversation(
        { principal_id: principalId, agent_id: TRAVELBOT_ID },
        createRequestIdentity("conversation_create"),
      );
      rememberRecentConversationId(principalId, result.data.conversation_id);
      router.push(`/demo?conversation=${encodeURIComponent(result.data.conversation_id)}`);
    } catch {
      setRecentMessage("Could not create a conversation. Please try again.");
      setCreatingConversation(false);
    }
  }, [creatingConversation, principalId, router]);

  return (
    <SidebarProvider
      className="min-h-dvh"
      style={{ "--sidebar-width": "15.5rem" } as CSSProperties}
    >
      <AppSidebar
        activePage={activePage}
        conversations={recents}
        newConversationDisabled={creatingConversation}
        onNewConversation={() => void createConversation()}
        onSelectConversation={(conversationId) => router.push(`/demo?conversation=${encodeURIComponent(conversationId)}`)}
        recentMessage={recentMessage}
      />
      <SidebarInset className="min-w-0 bg-background">
        <header className="flex h-12 items-center border-b bg-panel px-3 md:px-4"><SidebarTrigger aria-label="Toggle sidebar" /><span className="ml-2 text-sm text-muted-foreground">Account</span></header>
        <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
