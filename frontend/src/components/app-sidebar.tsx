"use client";

import Link from "next/link";
import {
  BotIcon,
  CreditCardIcon,
  FingerprintIcon,
  HandshakeIcon,
  HistoryIcon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  conversationStateLabels,
  conversationTitle,
} from "@/lib/conversation-history";
import type { TravelBotConversation } from "@/lib/contracts";

export type AccountPage = "payment-methods" | "purchases" | "merchants" | "trust";

const accountPages = [
  { key: "payment-methods", href: "/payment-methods", label: "Payment methods", icon: CreditCardIcon },
  { key: "purchases", href: "/purchases", label: "Purchases", icon: HistoryIcon },
  { key: "merchants", href: "/connected-merchants", label: "Connected merchants", icon: HandshakeIcon },
  { key: "trust", href: "/trust", label: "Identity & trust", icon: FingerprintIcon },
] as const;

export function AppSidebar({
  activeConversationId,
  activePage,
  conversations,
  newConversationDisabled = false,
  onNewConversation,
  onSelectConversation,
  recentMessage,
}: {
  activeConversationId?: string;
  activePage?: AccountPage;
  conversations: TravelBotConversation[];
  newConversationDisabled?: boolean;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: string) => void;
  recentMessage?: string;
}) {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b p-3">
        <div className="flex h-8 items-center justify-between px-1">
          <Link className="flex items-center gap-2" href="/demo">
            <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
              <ShieldCheckIcon className="size-3.5" />
            </span>
            <strong className="text-sm">Bound</strong>
          </Link>
        </div>
        <Button
          className="mt-2 justify-start"
          disabled={newConversationDisabled}
          onClick={onNewConversation}
          variant="outline"
        >
          <PlusIcon /> New conversation
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Your account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {accountPages.map((page) => {
                const Icon = page.icon;
                return (
                  <SidebarMenuItem key={page.key}>
                    <SidebarMenuButton
                      isActive={activePage === page.key}
                      render={<Link href={page.href} />}
                      tooltip={page.label}
                    >
                      <Icon />
                      <span>{page.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.length ? conversations.map((conversation) => (
                <SidebarMenuItem key={conversation.conversation_id}>
                  <SidebarMenuButton
                    className="h-auto items-start py-2.5"
                    isActive={conversation.conversation_id === activeConversationId}
                    onClick={() => onSelectConversation(conversation.conversation_id)}
                    tooltip={conversationTitle(conversation)}
                  >
                    <BotIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-xs font-medium">{conversationTitle(conversation)}</span>
                      <span className="truncate text-[10px] text-muted-foreground">
                        {conversationStateLabels[conversation.state]}
                      </span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )) : (
                <p aria-live="polite" className="px-2 py-3 text-xs leading-5 text-muted-foreground">
                  {recentMessage ?? "Your current conversation will appear here."}
                </p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        <div className="flex items-center gap-2.5 rounded-md p-1">
          <span className="grid size-8 place-items-center rounded-full border bg-background text-xs font-semibold">M</span>
          <div className="min-w-0">
            <strong className="block truncate text-xs">Marta</strong>
            <span className="block truncate text-[10px] text-muted-foreground">Mandate principal</span>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
