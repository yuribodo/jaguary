import type { FastifyPluginAsync } from "fastify";

import {
  agentRegistrationSchema,
  agentRequestVerificationSchema,
  identifierSchema,
  PublicApiError,
  type AgentIdentityRegistryPort,
  type AgentRequestVerifierPort,
} from "../../contracts/v1/index.js";

export const AGENT_REGISTRY_ROUTE = "/trust/v1/agents";
export const AGENT_VERIFICATION_ROUTE = "/trust/v1/agent-requests/verify";

interface AgentIdentityRoutesOptions {
  registry: AgentIdentityRegistryPort;
  verifier: AgentRequestVerifierPort;
}

function validationError(message: string): PublicApiError {
  return new PublicApiError(400, "validation_error", message);
}

export const agentIdentityRoutes: FastifyPluginAsync<AgentIdentityRoutesOptions> = async (app, options) => {
  app.post(AGENT_REGISTRY_ROUTE, async (request, reply) => {
    const registration = agentRegistrationSchema.safeParse(request.body);
    if (!registration.success) throw validationError("Agent registration is invalid");
    const idempotencyKey = request.headers["idempotency-key"];
    if (typeof idempotencyKey !== "string") {
      throw validationError("Idempotency-Key is invalid");
    }

    const result = await options.registry.register(registration.data, {
      correlationId: request.id,
      idempotencyKey,
    });
    request.log.info({
      agent_id: result.agent.agent_id,
      key_id: result.agent.verification_key.key_id,
      correlation_id: request.id,
    }, result.created ? "Agent identity registered" : "Agent identity registration replayed");
    void reply.status(result.created ? 201 : 200);
    return result.agent;
  });

  app.get<{ Params: { agentId: string } }>(`${AGENT_REGISTRY_ROUTE}/:agentId`, async (request) => {
    if (!identifierSchema.safeParse(request.params.agentId).success) {
      throw new PublicApiError(404, "agent_not_found", "Agent identity was not found");
    }
    const agent = await options.registry.get(request.params.agentId);
    if (agent === undefined) {
      throw new PublicApiError(404, "agent_not_found", "Agent identity was not found");
    }
    return agent;
  });

  app.post(AGENT_VERIFICATION_ROUTE, async (request) => {
    const verification = agentRequestVerificationSchema.safeParse(request.body);
    if (!verification.success) throw validationError("Agent verification request is invalid");
    const { proof } = verification.data;
    let result;
    try {
      result = await options.verifier.verify(proof, {
        method: request.method,
        route: AGENT_VERIFICATION_ROUTE,
        body: verification.data.request_body,
      });
    } catch (error) {
      request.log.warn({
        agent_id: proof.payload.agent_id,
        key_id: proof.key_id,
        correlation_id: request.id,
      }, "Agent request rejected");
      throw error;
    }
    request.log.info({
      agent_id: result.agent_id,
      key_id: result.key_id,
      correlation_id: request.id,
    }, "Agent request verified");
    return result;
  });
};
