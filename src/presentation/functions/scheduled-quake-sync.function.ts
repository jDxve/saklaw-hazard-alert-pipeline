import { onSchedule } from "firebase-functions/v2/scheduler";
import { IngestPhivolcsQuakesUseCase } from "../../application/use-cases/ingest-phivolcs-quakes.use-case";
import { Logger } from "../../domain/ports/logger";

export interface ScheduledQuakeSyncDeps {
  quakeUseCase: IngestPhivolcsQuakesUseCase;
  logger: Logger;
}

export function registerScheduledQuakeSync(deps: ScheduledQuakeSyncDeps) {
  return onSchedule(
    {
      schedule: "every 2 minutes",
      timeZone: "Asia/Manila",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async () => {
      deps.logger.info("PHIVOLCS quake sync started");
      await deps.quakeUseCase.execute();
      deps.logger.info("PHIVOLCS quake sync complete");
    },
  );
}
