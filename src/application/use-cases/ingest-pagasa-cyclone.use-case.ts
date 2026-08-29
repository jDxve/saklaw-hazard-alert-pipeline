import { FCM_TOPIC_CYCLONE } from "../../config/constants";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { CycloneSource } from "../../domain/ports/cyclone-source";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";
import { cycloneEventId } from "../../domain/rules/event-id.rules";
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
    const eventId = cycloneEventId(issuedAt, bulletin.maxSignal);

    const event: HazardEvent = {
      id: eventId,
      type: "cyclone",
      severity: cycloneSeverity(bulletin.maxSignal),
      sourceType: "official",
      title: `PAGASA: ${bulletin.stormName} (Signal #${bulletin.maxSignal} Active)`,
      plainSummary: `Active tropical cyclone in PAR. Highest wind signal hoisted: TCWS #${bulletin.maxSignal}.`,
      issuedAt,
      source: "DOST-PAGASA",
      raw: { stormName: bulletin.stormName, maxSignal: bulletin.maxSignal, checkedAt: issuedAt },
    };

    const created = await this.hazardEvents.saveIfAbsent(event);
    if (!created) {
      this.logger.info("Cyclone bulletin already recorded at this signal.", { eventId });
      return;
    }

    this.logger.info("Cyclone bulletin saved", {
      eventId,
      stormName: bulletin.stormName,
      maxSignal: bulletin.maxSignal,
    });

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
