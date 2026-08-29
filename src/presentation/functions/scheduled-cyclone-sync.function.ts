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
      // PAGASA serves these pages with `cache-control: max-age=60` behind a
      // CDN, so five minutes is still five times more conservative than the
      // freshness they publish — and it cuts the worst-case blind spot from
      // twenty minutes to five, which matters most for flooding.
      schedule: "every 5 minutes",
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
