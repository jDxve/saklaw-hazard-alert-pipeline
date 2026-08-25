import { onSchedule } from "firebase-functions/v2/scheduler";
import { IngestPagasaFloodUseCase } from "../../application/use-cases/ingest-pagasa-flood.use-case";
import { Logger } from "../../domain/ports/logger";

export interface ScheduledFloodSyncDeps {
  floodUseCase: IngestPagasaFloodUseCase;
  logger: Logger;
}

export function registerScheduledFloodSync(deps: ScheduledFloodSyncDeps) {
  return onSchedule(
    {
      schedule: "every 20 minutes",
      timeZone: "Asia/Manila",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async () => {
      deps.logger.info("PAGASA flood sync started");
      await deps.floodUseCase.execute();
      deps.logger.info("PAGASA flood sync complete");
    },
  );
}
