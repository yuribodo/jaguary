import { PublicApiError, type SanitizedPrincipal } from "../../contracts/v1/index.js";

export interface DemoPrincipalStore {
  ensureDemoPrincipal(now: Date): Promise<SanitizedPrincipal>;
}

/** Development-only authentication boundary for the deterministic Marta demo. */
export class DemoPrincipalAuthProvider {
  constructor(nodeEnvironment: "development" | "test" | "production", authMode: "demo" | "oidc") {
    if (nodeEnvironment !== "development" || authMode !== "demo") {
      throw new Error("DemoPrincipalAuthProvider can only be enabled in development demo mode");
    }
  }

  async authenticate(store: DemoPrincipalStore, now: Date): Promise<SanitizedPrincipal> {
    const principal = await store.ensureDemoPrincipal(now);
    if (principal.principal_id !== "principal_marta") {
      throw new PublicApiError(500, "internal_error", "Demo principal is unavailable");
    }
    return principal;
  }
}
