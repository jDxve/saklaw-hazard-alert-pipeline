import { AxiosError } from "axios";
import { Logger } from "../../domain/ports/logger";

// Back-off delay formula: 2^attempt * 500ms + jitter(0-300ms)
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  log: Logger,
  context: string,
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const isTransientNetworkError = err instanceof AxiosError && !err.response;
      if (!isTransientNetworkError || attempt === maxAttempts) throw err;

      const delayMs = Math.pow(2, attempt) * 500 + Math.random() * 300;
      log.warn(`${context}: attempt ${attempt} failed — retrying`, {
        delayMs:      Math.round(delayMs),
        errorMessage: (err as Error).message,
      });

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastErr;
}
