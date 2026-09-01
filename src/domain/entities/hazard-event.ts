export type HazardType = "quake" | "volcanic" | "cyclone" | "flood" | "severeWeather";
export type SeverityLevel = "info" | "advisory" | "warning" | "critical";

export interface GeoPoint {
  lat: number;
  lon: number;
}

/**
 * One place a hazard covers, in the source's own words.
 *
 * `approximate*` is this pipeline's own mapping, not the agency's boundary —
 * see `config/basin-geography.ts`. It exists so the API can answer "might this
 * reach my pin?", and it is labelled approximate everywhere it surfaces so it
 * is never mistaken for an official hazard boundary.
 */
export interface HazardArea {
  area: string;
  /** TCWS level over this area for a cyclone; null for every other hazard. */
  signalLevel: number | null;
  islandGroup: string | null;
  approximateCenter: GeoPoint | null;
  approximateRadiusKm: number | null;
}

export interface QuakeDetails {
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  location: string;
}

export interface CycloneDetails {
  stormName: string;
  category: string | null;
  /** Null when PAGASA published "No Tropical Cyclone Wind Signal". */
  maxSignal: number | null;
  center: GeoPoint | null;
  centerDescription: string | null;
  movement: string | null;
  maximumWindsKph: number | null;
  gustsKph: number | null;
  forecastPositions: readonly { at: string | null; description: string }[];
  checkedAt: string;
}

export interface FloodDetails {
  checkedAt: string;
  /** Names of the river basins that were on flood watch at checkedAt. */
  basinsOnWatch: readonly string[];
  basinsMonitored: number;
  /** PAGASA's per-basin PDF bulletin, where it publishes one. */
  bulletinUrls: readonly string[];
}

export interface HazardEvent {
  id: string;
  type: HazardType;
  severity: SeverityLevel;
  sourceType: "official";
  title: string;
  plainSummary: string;
  issuedAt: string;
  /**
   * When the source's own statement stops being current.
   *
   * Taken from the bulletin where the agency publishes one — PAGASA prints
   * "valid for broadcast until the next advisory to be issued at 11:00 AM" —
   * and otherwise left null. The read API pairs it with a per-type staleness
   * rule so an append-only store can still answer "what is active now".
   */
  validUntil: string | null;
  /** A single point, where the hazard has one. Quakes and cyclone centres do. */
  location: GeoPoint | null;
  /** Empty when the source named no areas. Never inferred. */
  affectedAreas: readonly HazardArea[];
  source: string;
  raw: QuakeDetails | CycloneDetails | FloodDetails;
}
