import { createHash, timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { z } from "zod";
import { RecordGisDatasetRevisionUseCase } from "../../application/use-cases/record-gis-dataset-revision.use-case";
import { Logger } from "../../domain/ports/logger";

const NOAH_WEBHOOK_SECRET = defineSecret("NOAH_WEBHOOK_SECRET");

const huggingFaceWebhookPayloadSchema = z.object({
  repo: z.object({ headSha: z.string().min(1).optional() }).optional(),
});

/**
 * Compares digests rather than the raw values so the comparison runs in
 * constant time and reveals nothing about the secret's length or contents
 * through response timing.
 */
function secretMatches(incoming: string, expected: string): boolean {
  const digest = (value: string): Buffer => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(incoming), digest(expected));
}

function headerValue(raw: string | string[] | undefined): string {
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

export interface NoahWebhookDeps {
  recordRevisionUseCase: RecordGisDatasetRevisionUseCase;
  logger: Logger;
}

export function registerNoahWebhook(deps: NoahWebhookDeps) {
  return onRequest(
    {
      region: "asia-southeast1",
      timeoutSeconds: 30,
      memory: "256MiB",
      secrets: [NOAH_WEBHOOK_SECRET],
    },
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      const expected = NOAH_WEBHOOK_SECRET.value();
      const incoming = headerValue(req.headers["x-webhook-secret"]);
      if (!expected || !secretMatches(incoming, expected)) {
        deps.logger.error("Webhook unauthorized: secret mismatch", new Error("Invalid secret"));
        res.status(401).send("Unauthorized");
        return;
      }

      const parsed = huggingFaceWebhookPayloadSchema.safeParse(req.body);
      const headSha = parsed.success ? parsed.data.repo?.headSha : undefined;

      if (!headSha) {
        const cause = parsed.success ? "missing headSha in payload" : parsed.error.message;
        deps.logger.error("Webhook bad request: missing headSha", new Error(cause));
        res.status(400).send("Bad Request: missing headSha");
        return;
      }

      try {
        const outcome = await deps.recordRevisionUseCase.execute(headSha, new Date().toISOString());
        res.status(200).json({ ok: true, outcome, commitSha: headSha });
      } catch (err) {
        // A 5xx tells Hugging Face to redeliver, so a transient Firestore
        // failure doesn't cost us the revision. The cause stays in the logs
        // rather than the response body.
        deps.logger.error("Webhook failed to record revision", err, { commitSha: headSha });
        res.status(500).json({ ok: false, error: "Failed to record revision" });
      }
    },
  );
}
