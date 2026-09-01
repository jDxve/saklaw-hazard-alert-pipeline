import {
  FCM_TOPIC_QUAKE,
  QUAKE_NOTIFY_MAG,
  QUAKE_NOTIFY_MAX_AGE_MINUTES,
} from "../../config/constants";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";
import { QuakeObservation, QuakeSource } from "../../domain/ports/quake-source";
import { quakeEventId } from "../../domain/rules/event-id.rules";
import { quakeSeverity } from "../../domain/rules/severity.rules";

export class IngestPhivolcsQuakesUseCase {
  constructor(
    private readonly quakeSource: QuakeSource,
    private readonly hazardEvents: HazardEventRepository,
    private readonly notifier: Notifier,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<void> {
    const observations = await this.quakeSource.fetchRecentQuakes();

    // Each observation is independent (distinct doc id, no shared state),
    // so they're processed concurrently rather than one row at a time.
    const results = await Promise.all(
      observations.map((observation) => this.processObservation(observation)),
    );
    const savedCount = results.filter(Boolean).length;

    this.logger.info("Ingestion complete", {
      rowsScanned: observations.length,
      newEvents: savedCount,
    });
  }

  private async processObservation(observation: QuakeObservation): Promise<boolean> {
    try {
      const event = this.toHazardEvent(observation);

      const created = await this.hazardEvents.saveIfAbsent(event);
      if (!created) return false;

      this.logger.info("Quake event saved", {
        eventId: event.id,
        magnitude: observation.magnitude,
        location: observation.location,
      });

      if (this.shouldNotify(observation)) {
        await this.notifier.send(
          {
            topic: FCM_TOPIC_QUAKE,
            notification: { title: event.title, body: event.plainSummary },
            data: { hazardId: event.id, type: event.type },
          },
          `quake M${observation.magnitude.toFixed(1)}`,
        );
      }

      return true;
    } catch (err) {
      this.logger.warn("Quake observation failed to process — skipped", {
        location: observation.location,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  private toHazardEvent(observation: QuakeObservation): HazardEvent {
    return {
      id: quakeEventId(observation),
      type: "quake",
      severity: quakeSeverity(observation.magnitude),
      sourceType: "official",
      // A quake is instantaneous: it has no validity window to publish, and
      // the API ages it out by recency rather than by an invented expiry.
      validUntil: null,
      location: { lat: observation.lat, lon: observation.lon },
      affectedAreas: [],
      title: `M${observation.magnitude.toFixed(1)} Earthquake — ${observation.location}`,
      plainSummary: `Depth: ${observation.depthKm} km. Verified seismic report from DOST-PHIVOLCS.`,
      issuedAt: observation.occurredAt,
      source: "DOST-PHIVOLCS",
      raw: {
        lat: observation.lat,
        lon: observation.lon,
        depthKm: observation.depthKm,
        magnitude: observation.magnitude,
        location: observation.location,
      },
    };
  }

  /**
   * Strong enough to matter, and recent enough to still be actionable. The age
   * check keeps a backfill or a catch-up run from pushing alerts for quakes
   * that are already over.
   */
  private shouldNotify(observation: QuakeObservation): boolean {
    if (observation.magnitude < QUAKE_NOTIFY_MAG) return false;

    const ageMinutes =
      (this.now().getTime() - Date.parse(observation.occurredAt)) / 60_000;
    if (Number.isNaN(ageMinutes)) return false;

    if (ageMinutes > QUAKE_NOTIFY_MAX_AGE_MINUTES) {
      this.logger.info("Quake too old to alert on — saved without notification", {
        eventId: quakeEventId(observation),
        ageMinutes: Math.round(ageMinutes),
      });
      return false;
    }

    return true;
  }
}
