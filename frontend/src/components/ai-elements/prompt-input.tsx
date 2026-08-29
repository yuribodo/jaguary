"use client";

import type {
  ComponentProps,
  FormEvent,
  HTMLAttributes,
  KeyboardEvent,
} from "react";
import type { ChatStatus, FileUIPart } from "ai";
import {
  CornerDownLeftIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type PromptInputMessage = {
  text: string;
  files: FileUIPart[];
};

export type PromptInputProps = Omit<
  ComponentProps<"form">,
  "onSubmit"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export function PromptInput({
  children,
  className,
  onSubmit,
  ...props
}: PromptInputProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const message = formData.get("message");
    const text = typeof message === "string" ? message : "";
    void onSubmit({ files: [], text }, event);
  }

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup className="h-auto overflow-hidden rounded-2xl bg-card shadow-sm">
        {children}
      </InputGroup>
    </form>
  );
}

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputBody({
  className,
  ...props
}: PromptInputBodyProps) {
  return <div className={cn("contents", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
>;

export function PromptInputTextarea({
  className,
  onKeyDown,
  ...props
}: PromptInputTextareaProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    const submit = event.currentTarget.form?.querySelector(
      "button[type=submit]",
    ) as HTMLButtonElement | null;
    if (!submit?.disabled) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <InputGroupTextarea
      className={cn(
        "field-sizing-content max-h-48 min-h-16 px-4 pt-3 text-sm",
        className,
      )}
      name="message"
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export function PromptInputFooter({
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-between gap-1 px-3 pb-2.5", className)}
      {...props}
    />
  );
}

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export function PromptInputTools({
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-1", className)}
      {...props}
    />
  );
}

export type PromptInputSubmitProps = ComponentProps<
  typeof InputGroupButton
> & {
  status?: ChatStatus;
};

export function PromptInputSubmit({
  children,
  className,
  status,
  ...props
}: PromptInputSubmitProps) {
  const pending = status === "submitted" || status === "streaming";
  let icon = <CornerDownLeftIcon className="size-4" />;
  if (status === "submitted") icon = <Spinner />;
  if (status === "streaming") icon = <SquareIcon className="size-4" />;
  if (status === "error") icon = <XIcon className="size-4" />;

  return (
    <InputGroupButton
      aria-label={pending ? "Processando" : "Enviar mensagem"}
      className={cn("rounded-lg", className)}
      size="icon-sm"
      type="submit"
      variant="default"
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  );
}
