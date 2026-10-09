import { getPrefs } from "../lib/preferences";
import type {
  LivezResponse,
  QuotaResponse,
  ReadyzResponse,
  StatsHistoryResponse,
  StatsLifetimeResponse,
  StatsResponse,
  SubscriptionWindowResponse,
} from "./types";

const REQUEST_TIMEOUT_MS = 20_000;

export type HeadroomErrorKind =
  "config" | "unauthorized" | "not_found" | "unavailable" | "network" | "timeout" | "server";

export class HeadroomError extends Error {
  readonly kind: HeadroomErrorKind;
  readonly status?: number;

  constructor(kind: HeadroomErrorKind, message: string, status?: number) {
    super(message);
    this.name = "HeadroomError";
    this.kind = kind;
    this.status = status;
  }
}

function bodyMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { error, detail } = body as { error?: unknown; detail?: unknown };
  if (typeof error === "string") return error;
  if (typeof detail === "string") return detail;
  return undefined;
}

function describeHttpError(status: number, path: string, body: unknown, hasToken: boolean): HeadroomError {
  const message = bodyMessage(body);
  if (status === 401) {
    return new HeadroomError(
      "unauthorized",
      hasToken
        ? "Headroom rejected the proxy token. Check the Proxy Token preference against HEADROOM_PROXY_TOKEN."
        : "Headroom requires a proxy token. Set the Proxy Token preference to the value of HEADROOM_PROXY_TOKEN.",
      status,
    );
  }
  if (status === 404) {
    return new HeadroomError(
      "not_found",
      `Headroom has no ${path} endpoint for this client. It may be an older Headroom version, or the endpoint is restricted to loopback callers.`,
      status,
    );
  }
  if (status === 503) {
    return new HeadroomError("unavailable", message ?? `Headroom reports ${path} as unavailable.`, status);
  }
  return new HeadroomError("server", message ?? `Headroom responded with HTTP ${status} on ${path}.`, status);
}

interface RequestOptions {
  signal?: AbortSignal;
  /** Statuses whose body is still a valid payload (health probes answer 503 with their report). */
  acceptStatuses?: number[];
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { baseUrl, proxyToken } = getPrefs();
  const { signal, acceptStatuses = [] } = options;

  if (!baseUrl) throw new HeadroomError("config", "Set the Headroom URL in the extension preferences.");

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (proxyToken) headers["X-Headroom-Proxy-Token"] = proxyToken;

  try {
    const response = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal });

    if (!response.ok && !acceptStatuses.includes(response.status)) {
      const body = await response.json().catch(() => undefined);
      throw describeHttpError(response.status, path.split("?")[0], body, Boolean(proxyToken));
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HeadroomError) throw error;
    if (timedOut) {
      throw new HeadroomError("timeout", `Headroom did not answer within ${REQUEST_TIMEOUT_MS / 1000}s (${baseUrl}).`);
    }
    if (signal?.aborted) throw error;
    const detail = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : "";
    throw new HeadroomError(
      "network",
      `Could not reach Headroom at ${baseUrl}${detail ? ` (${detail})` : ""}. Check the Headroom URL preference and that the proxy (or its container) is running.`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Liveness only; never probes the upstream provider. */
export function getLivez(signal?: AbortSignal) {
  return request<LivezResponse>("/livez", { signal, acceptStatuses: [503] });
}

/** Readiness with per-component checks; Headroom HEAD-probes its upstream at most every 30 s. */
export function getReadyz(signal?: AbortSignal) {
  return request<ReadyzResponse>("/readyz", { signal, acceptStatuses: [503] });
}

/** Runtime counters since the proxy process started (5 s server-side snapshot). */
export function getStats(signal?: AbortSignal) {
  return request<StatsResponse>("/stats?cached=1", { signal });
}

/** Persisted lifetime aggregates. */
export function getStatsLifetime(signal?: AbortSignal) {
  return request<StatsLifetimeResponse>("/stats-lifetime", { signal });
}

/** Every stored savings checkpoint (one per request that saved anything), uncompacted. */
export function getStatsHistory(signal?: AbortSignal) {
  return request<StatsHistoryResponse>("/stats-history?history_mode=full", { signal });
}

export type SubscriptionResult =
  { available: true; data: SubscriptionWindowResponse } | { available: false; reason: string };

/**
 * Anthropic subscription windows. Headroom answers 503 when subscription tracking is disabled; that is a state to
 * show, not a failure of the whole view.
 */
export async function loadSubscription(signal?: AbortSignal): Promise<SubscriptionResult> {
  try {
    return { available: true, data: await request<SubscriptionWindowResponse>("/subscription-window", { signal }) };
  } catch (error) {
    if (error instanceof HeadroomError && (error.kind === "unavailable" || error.kind === "not_found")) {
      return { available: false, reason: error.message };
    }
    throw error;
  }
}

/** Quota trackers that have data (Anthropic, Codex, Copilot). */
export function getQuota(signal?: AbortSignal) {
  return request<QuotaResponse>("/quota", { signal });
}
