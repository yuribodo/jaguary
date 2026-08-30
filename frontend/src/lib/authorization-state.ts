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
      label: "Decision not connected yet",
      description:
        "The BE-06 policy exists in the backend, but POST /verify and the BE-07 reservation are not connected yet. No ALLOW decision was simulated.",
    };
  },
};
