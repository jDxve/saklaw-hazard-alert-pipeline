import axios from "axios";
import { RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS } from "../../config/constants";
import { Logger } from "../../domain/ports/logger";

const RETRYABLE_STATUSES = new Set([408, 425, 429]);

/**
 * A request is worth repeating when it never reached the origin (DNS, reset,
 * timeout) or when the origin explicitly signalled "later" — 429 and 5xx.
 * A 4xx other than those is deterministic: repeating it only wastes the
 * function's budget and hammers the source.
 */
export function isRetryableError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true;
  return RETRYABLE_STATUSES.has(err.response.status) || err.response.status >= 500;
}

/** Honours `Retry-After`, in either its seconds or HTTP-date form. */
export function retryAfterDelayMs(err: unknown): number | null {
  if (!axios.isAxiosError(err)) return null;

  const header = err.response?.headers?.["retry-after"];
  if (typeof header !== "string" && typeof header !== "number") return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

  const until = Date.parse(String(header));
  return Number.isNaN(until) ? null : Math.max(0, until - Date.now());
}

/** Exponential back-off with full jitter, so parallel callers don't resynchronise. */
export function backoffDelayMs(attempt: number): number {
  const exponential = RETRY_BASE_DELAY_MS * 2 ** attempt;
  return Math.min(exponential, RETRY_MAX_DELAY_MS) + Math.random() * 300;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  log: Logger,
  context: string,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !isRetryableError(err)) throw err;

      // Retry-After is clamped: an upstream asking for an hour would otherwise
      // park the function until its timeout kills the whole run.
      const requested = retryAfterDelayMs(err);
      const delayMs =
        requested === null ? backoffDelayMs(attempt) : Math.min(requested, RETRY_MAX_DELAY_MS);

      log.warn(`${context}: attempt ${attempt} failed — retrying`, {
        delayMs: Math.round(delayMs),
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        errorMessage: err instanceof Error ? err.message : String(err),
      });

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
