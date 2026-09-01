import { GeoPoint, HazardEvent, HazardType } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { LocationRelevance, relevanceTo } from "../../domain/rules/geo.rules";
import { isActiveAt } from "../../domain/rules/hazard-lifecycle.rules";

export interface HazardQueryRequest {
  types: readonly HazardType[];
  /** Null returns both active and lapsed events within the window. */
  at: GeoPoint | null;
  radiusKm: number;
  since: string;
  limit: number;
  /** When true, drop anything whose validity has lapsed. */
  activeOnly: boolean;
}

export interface HazardQueryResult {
  event: HazardEvent;
  active: boolean;
  relevance: LocationRelevance | null;
}

/**
 * Reads hazards for a place and a moment.
 *
 * Time and type narrowing happen in the repository, which Firestore can index.
 * Liveness and location are decided here, over that bounded window, because
 * neither is a stored field: liveness is a rule over `validUntil`, and the
 * store holds no geohash to query location against.
 */
export class QueryHazardsUseCase {
  constructor(
    private readonly hazardEvents: HazardEventRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(request: HazardQueryRequest): Promise<HazardQueryResult[]> {
    const events = await this.hazardEvents.findRecent({
      types: request.types,
      since: request.since,
      limit: request.limit,
    });

    const now = this.now();
    const results: HazardQueryResult[] = [];

    for (const event of events) {
      const active = isActiveAt(event, now);
      if (request.activeOnly && !active) continue;

      // No location asked for: every event in the window qualifies.
      if (!request.at) {
        results.push({ event, active, relevance: null });
        continue;
      }

      const relevance = relevanceTo(event, request.at, request.radiusKm);
      if (!relevance) continue;

      results.push({ event, active, relevance });
    }

    return results;
  }

  async findById(id: string): Promise<HazardQueryResult | null> {
    const event = await this.hazardEvents.findById(id);
    if (!event) return null;
    return { event, active: isActiveAt(event, this.now()), relevance: null };
  }
}
