import type { createRequestIdentity } from "@/lib/bound-api";

const STORAGE_KEY = "bound.pending-biometric-consent.v1";

export type PendingBiometricConsent = {
  conversationId: string;
  watchId?: string;
  mandateId: string;
  consentId: string;
  refreshIdentity: ReturnType<typeof createRequestIdentity>;
  confirmationIdentity: ReturnType<typeof createRequestIdentity>;
};

export function writePendingBiometricConsent(value: PendingBiometricConsent): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readPendingBiometricConsent(): PendingBiometricConsent | undefined {
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<PendingBiometricConsent>;
    if (
      typeof value.conversationId !== "string"
      || (value.watchId !== undefined && typeof value.watchId !== "string")
      || typeof value.mandateId !== "string"
      || typeof value.consentId !== "string"
      || typeof value.refreshIdentity?.correlationId !== "string"
      || typeof value.refreshIdentity.idempotencyKey !== "string"
      || typeof value.confirmationIdentity?.correlationId !== "string"
      || typeof value.confirmationIdentity.idempotencyKey !== "string"
    ) return undefined;
    return value as PendingBiometricConsent;
  } catch {
    return undefined;
  }
}

export function clearPendingBiometricConsent(): void {
  window.sessionStorage.removeItem(STORAGE_KEY);
}
