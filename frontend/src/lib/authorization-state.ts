export type AuthorizationSurfaceState =
  | { kind: "NOT_REQUESTED"; label: string; description: string }
  | { kind: "PENDING"; label: string; description: string }
  | { kind: "ALLOW" | "DENY" | "ESCALATE"; label: string; description: string }
  | { kind: "NOT_CONNECTED"; label: string; description: string };

export interface AuthorizationDecisionSource {
  getState(mandateId: string): Promise<AuthorizationSurfaceState>;
}

/**
 * Replacement seam for the future HTTP decision/reservation surface. The pure
 * BE-06 policy exists server-side, but BE-07 does not expose it as an API yet.
 */
export const unavailableAuthorizationSource: AuthorizationDecisionSource = {
  async getState() {
    return {
      kind: "NOT_CONNECTED",
      label: "Decisão ainda não conectada",
      description:
        "A policy BE-06 existe no backend, mas POST /verify e a reserva BE-07 ainda não estão conectados. Nenhum ALLOW foi simulado.",
    };
  },
};
