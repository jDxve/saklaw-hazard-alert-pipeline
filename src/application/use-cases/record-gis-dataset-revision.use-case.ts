import { FCM_TOPIC_GIS } from "../../config/constants";
import { GisManifestRepository } from "../../domain/ports/gis-manifest.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";

export type RevisionOutcome = "updated" | "skipped";

export class RecordGisDatasetRevisionUseCase {
  constructor(
    private readonly manifests: GisManifestRepository,
    private readonly notifier: Notifier,
    private readonly logger: Logger,
    private readonly pmtilesUrl: string,
    private readonly layers: readonly string[],
  ) {}

  async execute(commitSha: string, lastModified: string): Promise<RevisionOutcome> {
    const currentSha = await this.manifests.getCurrentCommitSha();
    if (currentSha === commitSha) return "skipped";

    this.logger.info("New revision detected", { commitSha });

    await this.manifests.save({
      commitSha,
      lastModified,
      updatedAt: new Date().toISOString(),
      pmtilesUrl: this.pmtilesUrl,
      layers: this.layers,
    });

    await this.notifier.send(
      {
        topic: FCM_TOPIC_GIS,
        data: { type: "OTA_GIS_UPDATE", commitSha, pmtilesUrl: this.pmtilesUrl },
      },
      "OTA GIS Update",
    );

    return "updated";
  }
}
