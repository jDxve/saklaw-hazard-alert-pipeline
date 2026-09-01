import {
  CycloneDetails,
  FloodDetails,
  HazardEvent,
  QuakeDetails,
} from "../../domain/entities/hazard-event";
import { lifecycleBasis } from "../../domain/rules/hazard-lifecycle.rules";
import { HazardQueryResult } from "../../application/use-cases/query-hazards.use-case";

/**
 * The hazard as the app receives it.
 *
 * Deliberately not the Firestore document: `raw` is a union the client would
 * have to discriminate by hand, and the stored shape is free to change without
 * breaking an installed app. Every field the source did not publish is null or
 * empty here — never defaulted, never inferred.
 */
export interface HazardResponse {
  id: string;
  type: string;
  title: string;
  severity: string;
  summary: string;
  source: string;
  issuedAt: string;
  validUntil: string | null;
  /** "source" when the agency published the expiry, "pipeline" when inferred. */
  lifecycleBasis: "source" | "pipeline";
  active: boolean;
  location: { lat: number; lon: number } | null;
  affectedAreas: {
    area: string;
    signalLevel: number | null;
    islandGroup: string | null;
    approximateCenter: { lat: number; lon: number } | null;
    approximateRadiusKm: number | null;
  }[];
  /**
   * How this event matched the requested location, when one was given.
   *
   * `type: "unscoped"` means the source named no geography, so the event could
   * not be ruled out — not that it was confirmed nearby. `accuracy` says
   * whether the geometry behind an `area` match is the agency's or the
   * pipeline's own approximation; today every basin is `approximate`.
   */
  locationMatch: {
    type: string;
    accuracy: string | null;
  } | null;
  distanceKm: number | null;
  cyclone: CycloneResponse | null;
  quake: QuakeResponse | null;
  flood: FloodResponse | null;
}

export interface CycloneResponse {
  stormName: string;
  category: string | null;
  maxSignal: number | null;
  center: { lat: number; lon: number } | null;
  centerDescription: string | null;
  movement: string | null;
  maximumWindsKph: number | null;
  gustsKph: number | null;
  forecastPositions: { at: string | null; description: string }[];
}

export interface QuakeResponse {
  magnitude: number;
  depthKm: number;
  location: string;
}

export interface FloodResponse {
  basinsOnWatch: string[];
  basinsMonitored: number;
  bulletinUrls: string[];
}

const isCyclone = (event: HazardEvent): event is HazardEvent & { raw: CycloneDetails } =>
  event.type === "cyclone";
const isQuake = (event: HazardEvent): event is HazardEvent & { raw: QuakeDetails } =>
  event.type === "quake";
const isFlood = (event: HazardEvent): event is HazardEvent & { raw: FloodDetails } =>
  event.type === "flood";

export function toHazardResponse(result: HazardQueryResult): HazardResponse {
  const { event } = result;

  return {
    id: event.id,
    type: event.type,
    title: event.title,
    severity: event.severity,
    summary: event.plainSummary,
    source: event.source,
    issuedAt: event.issuedAt,
    validUntil: event.validUntil,
    lifecycleBasis: lifecycleBasis(event),
    active: result.active,
    location: event.location,
    affectedAreas: event.affectedAreas.map((area) => ({ ...area })),
    locationMatch: result.relevance
      ? { type: result.relevance.type, accuracy: result.relevance.accuracy }
      : null,
    distanceKm: result.relevance?.distanceKm ?? null,
    cyclone: isCyclone(event)
      ? {
          stormName: event.raw.stormName,
          category: event.raw.category,
          maxSignal: event.raw.maxSignal,
          center: event.raw.center,
          centerDescription: event.raw.centerDescription,
          movement: event.raw.movement,
          maximumWindsKph: event.raw.maximumWindsKph,
          gustsKph: event.raw.gustsKph,
          forecastPositions: [...event.raw.forecastPositions],
        }
      : null,
    quake: isQuake(event)
      ? {
          magnitude: event.raw.magnitude,
          depthKm: event.raw.depthKm,
          location: event.raw.location,
        }
      : null,
    flood: isFlood(event)
      ? {
          basinsOnWatch: [...event.raw.basinsOnWatch],
          basinsMonitored: event.raw.basinsMonitored,
          bulletinUrls: [...event.raw.bulletinUrls],
        }
      : null,
  };
}
