import { onSchedule } from "firebase-functions/v2/scheduler";
import { IngestPagasaCycloneUseCase } from "../../application/use-cases/ingest-pagasa-cyclone.use-case";
import { Logger } from "../../domain/ports/logger";

export interface ScheduledCycloneSyncDeps {
  cycloneUseCase: IngestPagasaCycloneUseCase;
  logger: Logger;
}

export function registerScheduledCycloneSync(deps: ScheduledCycloneSyncDeps) {
  return onSchedule(
    {
      schedule: "every 20 minutes",
      timeZone: "Asia/Manila",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async () => {
      deps.logger.info("PAGASA cyclone sync started");
      await deps.cycloneUseCase.execute();
      deps.logger.info("PAGASA cyclone sync complete");
    },
  );
}
