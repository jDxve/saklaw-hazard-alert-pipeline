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
      deps.logger.info("PAGASA flood sync started");
      await deps.floodUseCase.execute();
      deps.logger.info("PAGASA flood sync complete");
    },
  );
}
