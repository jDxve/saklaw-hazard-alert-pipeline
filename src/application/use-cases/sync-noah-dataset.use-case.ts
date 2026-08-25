import { GisDatasetSource } from "../../domain/ports/gis-dataset-source";
import { Logger } from "../../domain/ports/logger";
import { RecordGisDatasetRevisionUseCase } from "./record-gis-dataset-revision.use-case";

export class SyncNoahDatasetUseCase {
  constructor(
    private readonly gisSource: GisDatasetSource,
    private readonly recordRevision: RecordGisDatasetRevisionUseCase,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    try {
      const revision = await this.gisSource.fetchLatestRevision();
      if (!revision) return;

      await this.recordRevision.execute(revision.commitSha, revision.lastModified);
    } catch (err) {
      this.logger.error("Dataset check failed", err);
    }
  }
}
