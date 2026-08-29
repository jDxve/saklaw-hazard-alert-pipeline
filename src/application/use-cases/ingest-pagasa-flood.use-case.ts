import { FCM_TOPIC_FLOOD } from "../../config/constants";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { FloodSource } from "../../domain/ports/flood-source";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";
import { floodEventId } from "../../domain/rules/event-id.rules";
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
    const severity = floodSeverity(bulletin);
    const basinNames = bulletin.basinsOnWatch.map((basin) => basin.name);
    const eventId = floodEventId(issuedAt, severity, basinNames);

    const event: HazardEvent = {
      id: eventId,
      type: "flood",
      severity,
      sourceType: "official",
      title: `PAGASA: Flood Watch — ${formatBasinList(basinNames)}`,
      plainSummary:
        `${basinNames.length} of ${bulletin.basinsMonitored} monitored river basins are under flood watch.`,
      issuedAt,
      source: "DOST-PAGASA River Basin Center",
      raw: {
        checkedAt: issuedAt,
        basinsOnWatch: basinNames,
        basinsMonitored: bulletin.basinsMonitored,
      },
    };

    const created = await this.hazardEvents.saveIfAbsent(event);
    if (!created) {
      this.logger.info("Flood advisory already recorded at this severity.", { eventId });
      return;
    }

    this.logger.info("Flood bulletin saved", { eventId, severity, basinsOnWatch: basinNames });

    await this.notifier.send(
      {
        topic: FCM_TOPIC_FLOOD,
        notification: { title: event.title, body: event.plainSummary },
        data: {
          hazardId: event.id,
          type: event.type,
          severity,
          basinsOnWatch: basinNames.join(","),
        },
      },
      `flood advisory (${severity})`,
    );
  }
}

/** "Pampanga, Agno and 3 more" — keeps a push notification title readable. */
const MAX_BASINS_IN_TITLE = 2;

function formatBasinList(names: readonly string[]): string {
  if (names.length <= MAX_BASINS_IN_TITLE) return names.join(" and ");
  const shown = names.slice(0, MAX_BASINS_IN_TITLE).join(", ");
  return `${shown} and ${names.length - MAX_BASINS_IN_TITLE} more`;
}
