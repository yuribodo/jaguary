import { ExternalLinkIcon } from "lucide-react";

export function ReceiptFlightSourceLink({ sourceUrl }: Readonly<{ sourceUrl?: string }>) {
  if (sourceUrl === undefined) return null;

  return (
    <a
      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
      href={sourceUrl}
      rel="noreferrer"
      target="_blank"
    >
      Open in Google Flights <ExternalLinkIcon className="size-4" />
    </a>
  );
}
