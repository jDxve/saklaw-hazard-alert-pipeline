import assert from "node:assert/strict";
import { test } from "node:test";
import { AxiosError, AxiosHeaders } from "axios";
import { Logger } from "../../domain/ports/logger";
import { backoffDelayMs, isRetryableError, retryAfterDelayMs, withRetry } from "./with-retry";
import { RETRY_MAX_DELAY_MS } from "../../config/constants";

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

function axiosErrorWithStatus(status: number, headers: Record<string, string> = {}): AxiosError {
  const err = new AxiosError("request failed");
  err.response = {
    status,
    statusText: "",
    data: null,
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
  } as AxiosError["response"];
  return err;
}

test("isRetryableError retries requests that never reached the origin", () => {
  assert.equal(isRetryableError(new AxiosError("socket hang up")), true);
});

test("isRetryableError retries server errors and rate limits", () => {
  for (const status of [500, 502, 503, 504, 429, 408]) {
    assert.equal(isRetryableError(axiosErrorWithStatus(status)), true, `status ${status}`);
  }
});

test("isRetryableError does not retry deterministic client errors", () => {
  for (const status of [400, 401, 403, 404]) {
    assert.equal(isRetryableError(axiosErrorWithStatus(status)), false, `status ${status}`);
  }
});

test("isRetryableError ignores non-axios failures", () => {
  assert.equal(isRetryableError(new Error("parse blew up")), false);
});

test("retryAfterDelayMs reads the seconds form", () => {
  assert.equal(retryAfterDelayMs(axiosErrorWithStatus(429, { "retry-after": "2" })), 2000);
});

test("retryAfterDelayMs reads the HTTP-date form", () => {
  const future = new Date(Date.now() + 5000).toUTCString();
  const delay = retryAfterDelayMs(axiosErrorWithStatus(429, { "retry-after": future }));
  assert.ok(delay !== null && delay > 0 && delay <= 5000);
});

test("retryAfterDelayMs returns null when the header is absent", () => {
  assert.equal(retryAfterDelayMs(axiosErrorWithStatus(503)), null);
});

test("backoffDelayMs is capped so retries stay inside the function timeout", () => {
  assert.ok(backoffDelayMs(20) <= RETRY_MAX_DELAY_MS + 300);
});

test("withRetry returns the first successful result without retrying", async () => {
  let calls = 0;
  const result = await withRetry(async () => { calls++; return "ok"; }, 3, silentLogger, "test");
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withRetry recovers from a transient 503", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw axiosErrorWithStatus(503, { "retry-after": "0" });
      return "recovered";
    },
    3,
    silentLogger,
    "test",
  );
  assert.equal(result, "recovered");
  assert.equal(calls, 3);
});

test("withRetry gives up immediately on a non-retryable status", async () => {
  let calls = 0;
  await assert.rejects(() =>
    withRetry(
      async () => { calls++; throw axiosErrorWithStatus(404); },
      3,
      silentLogger,
      "test",
    ),
  );
  assert.equal(calls, 1);
});

test("withRetry surfaces the final error after exhausting attempts", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => { calls++; throw axiosErrorWithStatus(500, { "retry-after": "0" }); },
        3,
        silentLogger,
        "test",
      ),
    /request failed/,
  );
  assert.equal(calls, 3);
});
