import { FingerprintIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PendingVerificationControls({
  busy,
  consent,
  restarting,
  onCancel,
  onConsentChange,
  onRefresh,
  onRestart,
  onStart,
}: {
  busy: boolean;
  consent: boolean;
  restarting: boolean;
  onCancel: () => void;
  onConsentChange: (consent: boolean) => void;
  onRefresh: () => void;
  onRestart: () => void;
  onStart: () => void;
}) {
  if (!restarting) {
    return (
      <div className="grid gap-2 sm:flex">
        <Button className="min-h-11 w-full px-4 sm:w-auto" variant="outline" disabled={busy} onClick={onRefresh}>
          <RefreshCwIcon className={busy ? "animate-spin" : ""} /> {busy ? "Refreshing…" : "Check status"}
        </Button>
        <Button className="min-h-11 w-full px-4 sm:w-auto" variant="outline" disabled={busy} onClick={onRestart}>
          <FingerprintIcon /> Restart verification
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <label className="flex max-w-xl items-start gap-3 text-sm leading-6 text-muted-foreground">
        <input
          className="mt-1.5 size-4 accent-[#334de8]"
          type="checkbox"
          checked={consent}
          onChange={(event) => onConsentChange(event.target.checked)}
        />
        <span>I consent to opening Didit for a new identity verification session.</span>
      </label>
      <div className="grid gap-2 sm:flex">
        <Button className="min-h-11 w-full px-4 sm:w-auto" disabled={!consent || busy} onClick={onStart}>
          {busy ? "Opening Didit…" : "Start new check"}
        </Button>
        <Button className="min-h-11 w-full px-4 sm:w-auto" disabled={busy} onClick={onCancel} variant="ghost">
          Cancel
        </Button>
      </div>
    </div>
  );
}
