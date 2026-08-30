"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";

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
import type { TravelBotConversation, TravelWatch } from "@/lib/contracts";

const TRAVELBOT_ID = "agent_travelbot";

type AccountPageShellProps = {
  activePage: AccountPage;
  children: ReactNode;
};

type AccountActivity = {
  conversations: TravelBotConversation[];
  watchesByConversation: Record<string, TravelWatch>;
};

const AccountActivityContext = createContext<AccountActivity | null>(null);

export function useAccountActivity() {
  const activity = useContext(AccountActivityContext);
  if (activity === null) throw new Error("useAccountActivity must be used within AccountPageShell");
  return activity;
}

export function AccountPageShell(props: AccountPageShellProps) {
  const accountActivity = useContext(AccountActivityContext);
  if (accountActivity !== null) return props.children;

  return <AuthenticatedPage><WorkspaceAccountPageShell {...props} /></AuthenticatedPage>;
}

const activePageByPathname: Record<string, AccountPage> = {
  "/connected-agents": "agents",
  "/dashboard": "dashboard",
  "/opportunities": "opportunities",
  "/purchases": "purchases",
  "/payment-methods": "payment-methods",
  "/trilha-de-auditoria": "audit",
};

export function AccountRoutesLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activePage = activePageByPathname[pathname] ?? "dashboard";

  return (
    <AuthenticatedPage>
      <WorkspaceAccountPageShell activePage={activePage}>{children}</WorkspaceAccountPageShell>
    </AuthenticatedPage>
  );
}

function WorkspaceAccountPageShell({
  activePage,
  children,
}: AccountPageShellProps) {
  const router = useRouter();
  const principalSession = useAuthenticatedPrincipalSession();
  const principalId = principalSession.principal.principal_id;
  const [recents, setRecents] = useState<TravelBotConversation[]>([]);
  const [watchesByConversation, setWatchesByConversation] = useState<Record<string, TravelWatch>>({});
  const [recentMessage, setRecentMessage] = useState("Loading conversations…");
  const [creatingConversation, setCreatingConversation] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRecents() {
      const ids = readRecentConversationIds(principalId);
      if (!ids.length) {
        setRecents([]);
        setWatchesByConversation({});
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
      const loadedWatches = await Promise.allSettled(
        conversations.map(({ conversation_id }) => boundApi.getConversationWatch(conversation_id, controller.signal)),
      );
      if (controller.signal.aborted) return;
      setWatchesByConversation(Object.fromEntries(
        loadedWatches.flatMap((result) => result.status === "fulfilled" && result.value.data
          ? [[result.value.data.conversation_id, result.value.data] as const]
          : []),
      ));
      setRecentMessage(
        conversations.length
          ? ""
          : "Conversations are temporarily unavailable.",
      );
    }

    void loadRecents();
    const interval = window.setInterval(() => void loadRecents(), 10_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [principalId]);

  const createConversation = useCallback(async () => {
    if (creatingConversation) return;
    setCreatingConversation(true);
    setRecentMessage("Creating conversation…");

    try {
      const result = await boundApi.createConversation(
        TRAVELBOT_ID,
        principalSession.csrf_token,
        createRequestIdentity("conversation_create"),
      );
      rememberRecentConversationId(principalId, result.data.conversation_id);
      router.push(`/demo?conversation=${encodeURIComponent(result.data.conversation_id)}`);
    } catch {
      setRecentMessage("Could not create a conversation. Please try again.");
      setCreatingConversation(false);
    }
  }, [creatingConversation, principalId, principalSession.csrf_token, router]);

  return (
    <AccountActivityContext.Provider value={{ conversations: recents, watchesByConversation }}>
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
          watchesByConversation={watchesByConversation}
        />
        <SidebarInset className="min-w-0 bg-background">
          <header className="flex h-12 items-center border-b bg-panel px-3 md:px-4"><SidebarTrigger aria-label="Toggle sidebar" /><span className="ml-2 text-sm text-muted-foreground">Account</span></header>
          <main className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </AccountActivityContext.Provider>
  );
}
