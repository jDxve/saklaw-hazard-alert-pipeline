import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { z } from "zod";
import { RecordGisDatasetRevisionUseCase } from "../../application/use-cases/record-gis-dataset-revision.use-case";
import { Logger } from "../../domain/ports/logger";

const NOAH_WEBHOOK_SECRET = defineSecret("NOAH_WEBHOOK_SECRET");

const huggingFaceWebhookPayloadSchema = z.object({
  repo: z.object({ headSha: z.string().optional() }).optional(),
});

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

      const incoming = (req.headers["x-webhook-secret"] as string) ?? "";
      const expected = NOAH_WEBHOOK_SECRET.value();
      if (!expected || incoming !== expected) {
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

      const outcome = await deps.recordRevisionUseCase.execute(headSha, new Date().toISOString());
      res.status(200).json({ ok: true, outcome, commitSha: headSha });
    },
  );
}
