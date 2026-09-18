import type { PublishedCapability } from "./tools";

/**
 * A client for the public agent surface.
 *
 * The runtime deliberately reaches Agent Access the same way any outside agent
 * would: HTTPS, a short-lived delegated credential, an idempotency key per
 * call. It holds no database handle and no vendor credential, so a bug in the
 * loop cannot reach past what the delegation already permits, and a run is
 * evidence the published surface actually works rather than evidence that some
 * privileged internal path does.
 */
export class SurfaceError extends Error {
  constructor(message: string, public status: number, public operationId?: string) {
    super(message);
    this.name = "SurfaceError";
  }
}

export type Registration = {
  agent_account_id: string;
  delegation_id: string;
  capabilities: string[];
  credential: string;
  expires_at: string;
};

export type InvocationReceipt = {
  receipt_id: string;
  status_code: number;
  signature: string;
  result?: unknown;
  response?: unknown;
  replayed?: boolean;
  capability?: { policy?: string };
};

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new SurfaceError(`Agent surface returned a non-JSON body (${response.status})`, response.status);
  }
}

function errorMessage(body: Record<string, unknown>, fallback: string) {
  return typeof body.error === "string" ? body.error : fallback;
}

export class AgentSurfaceClient {
  constructor(
    private readonly origin: string,
    private readonly slug: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string) {
    return new URL(path, this.origin).toString();
  }

  /** The discovery document an agent reads before it knows anything else. */
  async discover() {
    const response = await this.fetchImpl(this.url(`/.well-known/agent-access/${this.slug}`));
    const body = await readJson(response);
    if (!response.ok) throw new SurfaceError(errorMessage(body, "Agent surface not found"), response.status);
    return body;
  }

  async listCapabilities(): Promise<PublishedCapability[]> {
    const response = await this.fetchImpl(this.url(`/api/agent/v1/${this.slug}/capabilities`));
    const body = await readJson(response);
    if (!response.ok) throw new SurfaceError(errorMessage(body, "Agent surface not found"), response.status);
    return (body.capabilities ?? []) as PublishedCapability[];
  }

  /** Registers this run as its own Agent Account so one run's authority never outlives it. */
  async register(name: string, requestedCapabilities?: string[]): Promise<Registration> {
    const response = await this.fetchImpl(this.url(`/api/agent/v1/${this.slug}/accounts`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, ...(requestedCapabilities?.length ? { requested_capabilities: requestedCapabilities } : {}) }),
    });
    const body = await readJson(response);
    if (!response.ok) throw new SurfaceError(errorMessage(body, "Registration failed"), response.status);
    return body as unknown as Registration;
  }

  async invoke(options: {
    operationId: string;
    credential: string;
    body: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<InvocationReceipt> {
    const response = await this.fetchImpl(this.url(`/api/agent/v1/${this.slug}/invoke/${encodeURIComponent(options.operationId)}`), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.credential}`,
        "idempotency-key": options.idempotencyKey,
      },
      body: JSON.stringify(options.body),
    });
    const body = await readJson(response);
    // A 4xx here is a policy or credential decision, not a transport failure.
    // The runtime surfaces it to the model as a tool error so it can adapt.
    if (!response.ok && !body.receipt_id) {
      throw new SurfaceError(errorMessage(body, "Invocation failed"), response.status, options.operationId);
    }
    return body as unknown as InvocationReceipt;
  }
}

/**
 * Idempotency keys are derived, not random: the same step retried after a
 * crash replays the stored receipt instead of invoking the vendor twice.
 */
export function idempotencyKeyFor(runId: string, toolUseId: string) {
  return `${runId}:${toolUseId}`.slice(0, 128);
}
