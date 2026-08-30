"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Menu } from "@base-ui/react/menu";
import {
  BotIcon,
  ChevronsUpDownIcon,
  CreditCardIcon,
  FingerprintIcon,
  HandshakeIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  LoaderCircleIcon,
  LogOutIcon,
  PlusIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuthenticatedPrincipalSession } from "@/components/authenticated-page";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  conversationStateLabels,
  conversationTitle,
} from "@/lib/conversation-history";
import { boundApi, createRequestIdentity } from "@/lib/bound-api";
import type { TravelBotConversation } from "@/lib/contracts";

export type AccountPage = "dashboard" | "agents" | "opportunities" | "approvals" | "payment-methods" | "purchases" | "merchants" | "audit" | "trust";

const accountPages = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { key: "agents", href: "/connected-agents", label: "Connected agents", icon: BotIcon },
  { key: "opportunities", href: "/opportunities", label: "Opportunities", icon: HandshakeIcon },
  { key: "approvals", href: "/approval-center", label: "Approval Center", icon: ScrollTextIcon },
  { key: "payment-methods", href: "/payment-methods", label: "Payment methods", icon: CreditCardIcon },
  { key: "purchases", href: "/purchases", label: "Purchases", icon: HistoryIcon },
  { key: "audit", href: "/trilha-de-auditoria", label: "Audit trail", icon: ScrollTextIcon },
] as const;

export function AppSidebar({
  activeConversationId,
  activePage,
  conversations,
  newConversationDisabled = false,
  onNewConversation,
  onDiscardConversation,
  onSelectConversation,
  recentMessage,
}: {
  activeConversationId?: string;
  activePage?: AccountPage;
  conversations: TravelBotConversation[];
  newConversationDisabled?: boolean;
  onNewConversation: () => void;
  onDiscardConversation?: (conversationId: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
  recentMessage?: string;
}) {
  const router = useRouter();
  const principalSession = useAuthenticatedPrincipalSession();
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const discardTriggerRef = useRef<HTMLButtonElement>(null);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [discardError, setDiscardError] = useState<string>();
  const [discardTarget, setDiscardTarget] = useState<TravelBotConversation>();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();

  function requestLogout() {
    setLogoutError(undefined);
    setLogoutConfirmationOpen(true);
  }

  function requestDiscard(conversation: TravelBotConversation, trigger: HTMLButtonElement) {
    discardTriggerRef.current = trigger;
    setDiscardTarget(conversation);
    setDiscardError(undefined);
    setDiscardConfirmationOpen(true);
  }

  async function discardConversation() {
    if (discardBusy || discardTarget === undefined || onDiscardConversation === undefined) return;
    setDiscardBusy(true);
    setDiscardError(undefined);
    try {
      await onDiscardConversation(discardTarget.conversation_id);
      setDiscardConfirmationOpen(false);
      setDiscardTarget(undefined);
    } catch (caught) {
      setDiscardError(caught instanceof Error ? caught.message : "Could not discard this conversation. Please try again.");
    } finally {
      setDiscardBusy(false);
    }
  }

  async function logout() {
    if (logoutBusy) return;

    setLogoutBusy(true);
    setLogoutError(undefined);
    try {
      await boundApi.logoutPrincipal(principalSession.csrf_token, createRequestIdentity("logout_sidebar"));
      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("Could not log out. Please try again.");
      setLogoutBusy(false);
    }
  }

  const principalName = principalSession.principal.display_name;

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b p-3">
        <div className="flex h-8 items-center justify-between px-1">
          <Link className="flex items-center gap-2" href="/demo">
            <span className="grid size-7 place-items-center rounded-md bg-foreground text-background">
              <ShieldCheckIcon className="size-3.5" />
            </span>
            <strong className="text-sm">Jaguary</strong>
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
                    className="h-auto items-start py-2.5 pr-9"
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
                  {onDiscardConversation ? (
                    <SidebarMenuAction
                      aria-label={`Discard ${conversationTitle(conversation)}`}
                      className="top-2.5 right-1.5 size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={newConversationDisabled || discardBusy}
                      onClick={(event) => requestDiscard(conversation, event.currentTarget)}
                      showOnHover
                      title="Discard conversation"
                    >
                      <Trash2Icon className="size-3.5" />
                    </SidebarMenuAction>
                  ) : null}
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
        <Menu.Root>
          <Menu.Trigger className="flex min-h-11 w-full items-center gap-2.5 rounded-md p-1 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-pressed:bg-sidebar-accent" ref={profileTriggerRef}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-xs font-semibold">
              {principalName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{principalName}</strong>
              <span className="block truncate text-[10px] text-muted-foreground">Mandate principal</span>
            </span>
            <ChevronsUpDownIcon className="mr-1 size-3.5 shrink-0 text-muted-foreground" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner align="start" className="z-50 outline-none" side="top" sideOffset={8}>
              <Menu.Popup className="w-[var(--anchor-width)] min-w-52 origin-[var(--transform-origin)] rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none transition-[transform,opacity] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
                <div className="px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{principalName}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Signed in to Jaguary</p>
                </div>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.LinkItem
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-md px-2 text-xs outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  closeOnClick
                  render={<Link href="/trust" />}
                >
                  <FingerprintIcon className="size-3.5" /> Identity &amp; trust
                </Menu.LinkItem>
                <Menu.Item
                  className="flex min-h-9 cursor-default items-center gap-2 rounded-md px-2 text-xs text-destructive outline-none data-highlighted:bg-destructive/10"
                  onClick={requestLogout}
                >
                  <LogOutIcon className="size-3.5" /> Log out
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </SidebarFooter>

      <AlertDialog.Root
        onOpenChange={(open) => {
          if (logoutBusy) return;
          setLogoutConfirmationOpen(open);
          if (!open) setLogoutError(undefined);
        }}
        open={logoutConfirmationOpen}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
            <AlertDialog.Popup className="w-full max-w-sm rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0" finalFocus={profileTriggerRef}>
              <AlertDialog.Title className="text-base font-semibold">Log out of Jaguary?</AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                You&apos;ll need to sign in again to access your conversations and account.
              </AlertDialog.Description>
              {logoutError && <p className="mt-3 text-xs text-destructive" role="alert">{logoutError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialog.Close
                  disabled={logoutBusy}
                  render={<Button variant="outline" />}
                >
                  Cancel
                </AlertDialog.Close>
                <Button disabled={logoutBusy} onClick={() => void logout()} variant="destructive">
                  {logoutBusy ? <LoaderCircleIcon className="animate-spin" /> : <LogOutIcon />}
                  {logoutBusy ? "Logging out…" : "Log out"}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <AlertDialog.Root
        onOpenChange={(open) => {
          if (discardBusy) return;
          setDiscardConfirmationOpen(open);
          if (!open) {
            setDiscardError(undefined);
            setDiscardTarget(undefined);
          }
        }}
        open={discardConfirmationOpen}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
          <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
            <AlertDialog.Popup className="w-full max-w-sm rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0" finalFocus={discardTriggerRef}>
              <span className="grid size-9 place-items-center rounded-full bg-destructive/10 text-destructive">
                <Trash2Icon className="size-4" />
              </span>
              <AlertDialog.Title className="mt-4 text-base font-semibold">Discard this conversation?</AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                <strong className="font-medium text-foreground">{discardTarget ? conversationTitle(discardTarget) : "This conversation"}</strong> and its messages will be permanently deleted. This can&apos;t be undone.
              </AlertDialog.Description>
              {discardError && <p className="mt-3 text-xs text-destructive" role="alert">{discardError}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialog.Close disabled={discardBusy} render={<Button variant="outline" />}>Cancel</AlertDialog.Close>
                <Button disabled={discardBusy} onClick={() => void discardConversation()} variant="destructive">
                  {discardBusy ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
                  {discardBusy ? "Discarding…" : "Discard"}
                </Button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Viewport>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <SidebarRail />
    </Sidebar>
  );
}
