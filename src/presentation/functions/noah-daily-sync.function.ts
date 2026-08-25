import { onSchedule } from "firebase-functions/v2/scheduler";
import { SyncNoahDatasetUseCase } from "../../application/use-cases/sync-noah-dataset.use-case";
import { Logger } from "../../domain/ports/logger";

export interface NoahDailySyncDeps {
  syncUseCase: SyncNoahDatasetUseCase;
  logger: Logger;
}

export function registerNoahDailySync(deps: NoahDailySyncDeps) {
  return onSchedule(
    {
      schedule: "0 2 * * *",
      timeZone: "Asia/Manila",
      timeoutSeconds: 60,
      memory: "256MiB",
    },
    async () => {
      deps.logger.info("Project NOAH daily check started");
      await deps.syncUseCase.execute();
      deps.logger.info("Project NOAH daily check complete");
    },
  );
}
