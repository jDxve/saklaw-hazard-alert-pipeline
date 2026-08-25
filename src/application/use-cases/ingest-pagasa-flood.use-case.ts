import { FCM_TOPIC_FLOOD } from "../../config/constants";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { FloodSource } from "../../domain/ports/flood-source";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";
import { floodSeverity } from "../../domain/rules/severity.rules";

export class IngestPagasaFloodUseCase {
  constructor(
    private readonly floodSource: FloodSource,
    private readonly hazardEvents: HazardEventRepository,
    private readonly notifier: Notifier,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<void> {
    const bulletin = await this.floodSource.fetchActiveFloodBulletin();
    if (!bulletin) return;

    const issuedAt = this.now().toISOString();
    const eventId = `pagasa_flood_${issuedAt.slice(0, 13)}`;

    if (await this.hazardEvents.exists(eventId)) {
      this.logger.info("Flood advisory already recorded for this hour.", { eventId });
      return;
    }

    const severity = floodSeverity(bulletin);
    const event: HazardEvent = {
      id: eventId,
      type: "flood",
      severity,
      sourceType: "official",
      title:
        severity === "critical"
          ? "PAGASA: Critical River Flood Warning"
          : "PAGASA: Flood Advisory Active",
      plainSummary:
        "Elevated river stage and water levels detected in monitored river basin channels.",
      issuedAt,
      source: "DOST-PAGASA River Basin Center",
      raw: { checkedAt: issuedAt },
    };

    await this.hazardEvents.save(event);
    this.logger.info("Flood bulletin saved", { eventId, severity });

    await this.notifier.send(
      {
        topic: FCM_TOPIC_FLOOD,
        notification: { title: event.title, body: event.plainSummary },
        data: { hazardId: event.id, type: event.type, severity },
      },
      `flood advisory (${severity})`,
    );
  }
}
