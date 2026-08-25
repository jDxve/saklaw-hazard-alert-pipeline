import { FCM_TOPIC_CYCLONE } from "../../config/constants";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { CycloneSource } from "../../domain/ports/cyclone-source";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";
import { cycloneSeverity } from "../../domain/rules/severity.rules";

export class IngestPagasaCycloneUseCase {
  constructor(
    private readonly cycloneSource: CycloneSource,
    private readonly hazardEvents: HazardEventRepository,
    private readonly notifier: Notifier,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<void> {
    const bulletin = await this.cycloneSource.fetchActiveCyclone();
    if (!bulletin) return;

    const issuedAt = this.now().toISOString();
    const eventId = `pagasa_tc_${issuedAt.slice(0, 13)}`;

    if (await this.hazardEvents.exists(eventId)) {
      this.logger.info("Cyclone bulletin already recorded for this hour.", { eventId });
      return;
    }

    const severity = cycloneSeverity(bulletin.maxSignal);
    const event: HazardEvent = {
      id: eventId,
      type: "cyclone",
      severity,
      sourceType: "official",
      title: `PAGASA: ${bulletin.stormName} (Signal #${bulletin.maxSignal} Active)`,
      plainSummary: `Active tropical cyclone in PAR. Highest wind signal hoisted: TCWS #${bulletin.maxSignal}.`,
      issuedAt,
      source: "DOST-PAGASA",
      raw: { stormName: bulletin.stormName, maxSignal: bulletin.maxSignal, checkedAt: issuedAt },
    };

    await this.hazardEvents.save(event);
    this.logger.info("Cyclone bulletin saved", { eventId, stormName: bulletin.stormName, maxSignal: bulletin.maxSignal });

    await this.notifier.send(
      {
        topic: FCM_TOPIC_CYCLONE,
        notification: { title: event.title, body: event.plainSummary },
        data: { hazardId: event.id, type: event.type, maxSignal: String(bulletin.maxSignal) },
      },
      `cyclone TCWS#${bulletin.maxSignal}`,
    );
  }
}
