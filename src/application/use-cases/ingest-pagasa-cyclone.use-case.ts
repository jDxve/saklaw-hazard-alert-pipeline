import { FCM_TOPIC_CYCLONE } from "../../config/constants";
import { GeoPoint, HazardEvent } from "../../domain/entities/hazard-event";
import { CycloneBulletin, CycloneSource } from "../../domain/ports/cyclone-source";
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

    // The bulletin's own issue stamp where PAGASA printed one; the clock only
    // as a fallback, so an event is dated by the source when the source says.
    const checkedAt = this.now().toISOString();
    const issuedAt = bulletin.issuedAt ?? checkedAt;
    const eventId = cycloneEventId(issuedAt, bulletin.maxSignal);

    const event: HazardEvent = {
      id: eventId,
      type: "cyclone",
      severity: cycloneSeverity(bulletin.maxSignal),
      sourceType: "official",
      title: cycloneTitle(bulletin),
      plainSummary: cycloneSummary(bulletin),
      issuedAt,
      validUntil: bulletin.validUntil,
      location: centerPoint(bulletin),
      affectedAreas: bulletin.affectedAreas.map((area) => ({
        area: area.area,
        signalLevel: area.signalLevel,
        islandGroup: area.islandGroup,
        // PAGASA names areas in prose and publishes no geometry for them, so
        // nothing here is placed on the map. The named area is what we have.
        approximateCenter: null,
        approximateRadiusKm: null,
      })),
      source: "DOST-PAGASA",
      raw: {
        stormName: bulletin.stormName,
        category: bulletin.category,
        maxSignal: bulletin.maxSignal,
        center: centerPoint(bulletin),
        centerDescription: bulletin.center?.description ?? null,
        movement: bulletin.movement,
        maximumWindsKph: bulletin.maximumWindsKph,
        gustsKph: bulletin.gustsKph,
        forecastPositions: bulletin.forecastPositions,
        checkedAt,
      },
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
      affectedAreas: bulletin.affectedAreas.length,
    });

    // Nothing is pushed for a storm with no signal hoisted: it is in PAR and
    // worth showing in the app, but it is not a warning to wake anyone for.
    if (bulletin.maxSignal === null) return;

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

/**
 * The eye's position, only when the bulletin printed coordinates for it. A
 * located centre is the one point a cyclone event can be placed on a map by.
 */
function centerPoint(bulletin: CycloneBulletin): GeoPoint | null {
  const center = bulletin.center;
  if (!center || center.lat === null || center.lon === null) return null;
  return { lat: center.lat, lon: center.lon };
}

/** "PAGASA: Super Typhoon PEPITO (Signal #5)" — or the signal's absence. */
function cycloneTitle(bulletin: CycloneBulletin): string {
  const named = [bulletin.category, bulletin.stormName].filter(Boolean).join(" ");
  const signal =
    bulletin.maxSignal === null ? "no wind signal" : `Signal #${bulletin.maxSignal}`;
  return `PAGASA: ${named} (${signal})`;
}

function cycloneSummary(bulletin: CycloneBulletin): string {
  if (bulletin.maxSignal === null) {
    return "Active tropical cyclone in PAR. PAGASA has hoisted no wind signal.";
  }
  const areas = bulletin.affectedAreas.filter(
    (area) => area.signalLevel === bulletin.maxSignal,
  ).length;
  const over = areas > 0 ? ` over ${areas} area${areas === 1 ? "" : "s"}` : "";
  return `Active tropical cyclone in PAR. Highest wind signal hoisted: TCWS #${bulletin.maxSignal}${over}.`;
}
