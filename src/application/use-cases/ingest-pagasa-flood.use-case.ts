import { FCM_TOPIC_FLOOD } from "../../config/constants";
import { basinGeography } from "../../config/basin-geography";
import { HazardArea, HazardEvent } from "../../domain/entities/hazard-event";
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
      // PAGASA prints no expiry on the basin table — only a live state — so
      // this stays null and the lifecycle rule ages the reading out instead.
      // Writing a computed time here would report the pipeline's own guess to
      // the app as though the agency had published it.
      validUntil: null,
      location: null,
      affectedAreas: bulletin.basinsOnWatch.map(toHazardArea),
      source: "DOST-PAGASA River Basin Center",
      raw: {
        checkedAt: issuedAt,
        basinsOnWatch: basinNames,
        basinsMonitored: bulletin.basinsMonitored,
        bulletinUrls: bulletin.basinsOnWatch
          .map((basin) => basin.bulletinUrl)
          .filter((url): url is string => url !== null),
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

/**
 * A basin on watch, with this pipeline's approximate placement attached when it
 * has one. A basin missing from the table gets no coordinates rather than a
 * guessed centre — the API then reports it without location filtering.
 */
function toHazardArea(basin: { name: string }): HazardArea {
  const geography = basinGeography(basin.name);
  return {
    area: basin.name,
    signalLevel: null,
    islandGroup: null,
    approximateCenter: geography?.center ?? null,
    approximateRadiusKm: geography?.approximateRadiusKm ?? null,
  };
}
