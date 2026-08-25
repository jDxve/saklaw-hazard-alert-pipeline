import { onSchedule } from "firebase-functions/v2/scheduler";
import { IngestPagasaCycloneUseCase } from "../../application/use-cases/ingest-pagasa-cyclone.use-case";
import { IngestPagasaFloodUseCase } from "../../application/use-cases/ingest-pagasa-flood.use-case";
import { IngestPhivolcsQuakesUseCase } from "../../application/use-cases/ingest-phivolcs-quakes.use-case";
import { Logger } from "../../domain/ports/logger";

export interface ScheduledOfficialSyncDeps {
  quakeUseCase: IngestPhivolcsQuakesUseCase;
  cycloneUseCase: IngestPagasaCycloneUseCase;
  floodUseCase: IngestPagasaFloodUseCase;
  logger: Logger;
}

export function registerScheduledOfficialSync(deps: ScheduledOfficialSyncDeps) {
  return onSchedule(
    {
      schedule: "every 1 minutes",
      timeZone: "Asia/Manila",
      timeoutSeconds: 120,
      memory: "256MiB",
    },
    async () => {
      deps.logger.info("Sync cycle started");

      const [phivolcsResult, pagasaResult, floodResult] = await Promise.allSettled([
        deps.quakeUseCase.execute(),
        deps.cycloneUseCase.execute(),
        deps.floodUseCase.execute(),
      ]);

      if (phivolcsResult.status === "rejected") {
        deps.logger.error("PHIVOLCS pipeline rejected unexpectedly", phivolcsResult.reason);
      }
      if (pagasaResult.status === "rejected") {
        deps.logger.error("PAGASA pipeline rejected unexpectedly", pagasaResult.reason);
      }
      if (floodResult.status === "rejected") {
        deps.logger.error("PAGASA Flood pipeline rejected unexpectedly", floodResult.reason);
      }

      deps.logger.info("Sync cycle complete");
    },
  );
}
