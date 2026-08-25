import { FCM_TOPIC_QUAKE, QUAKE_NOTIFY_MAG } from "../../config/constants";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier } from "../../domain/ports/notifier";
import { QuakeObservation, QuakeSource } from "../../domain/ports/quake-source";
import { quakeSeverity } from "../../domain/rules/severity.rules";

export class IngestPhivolcsQuakesUseCase {
  constructor(
    private readonly quakeSource: QuakeSource,
    private readonly hazardEvents: HazardEventRepository,
    private readonly notifier: Notifier,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    const observations = await this.quakeSource.fetchRecentQuakes();

    // Each observation is independent (distinct doc id, no shared state),
    // so they're processed concurrently rather than one row at a time.
    const results = await Promise.all(
      observations.map((observation) => this.processObservation(observation)),
    );
    const savedCount = results.filter(Boolean).length;

    this.logger.info("Ingestion complete", { rowsScanned: observations.length, newEvents: savedCount });
  }

  private async processObservation(observation: QuakeObservation): Promise<boolean> {
    try {
      const eventId = `phivolcs_eq_${new Date(observation.occurredAt).getTime()}`;
      if (await this.hazardEvents.exists(eventId)) return false;

      const severity = quakeSeverity(observation.magnitude);
      const event: HazardEvent = {
        id: eventId,
        type: "quake",
        severity,
        sourceType: "official",
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

      await this.hazardEvents.save(event);
      this.logger.info("Quake event saved", {
        eventId,
        magnitude: observation.magnitude,
        location: observation.location,
      });

      if (observation.magnitude >= QUAKE_NOTIFY_MAG) {
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
}
