import { GeoPoint, HazardEvent } from "../entities/hazard-event";

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * How an event came to be included for a location.
 *
 * `unscoped` is the honest answer for a hazard the source describes only in
 * prose — a TCWS over "the rest of Camarines Norte" has no coordinates
 * anywhere in the bulletin. Dropping those from a location query would hide
 * real warnings, so they are returned and labelled, and the app can say
 * "may affect your area" rather than pretending to a precise match.
 */
export type LocationMatchType = "point" | "area" | "unscoped";

/**
 * How much the geometry behind a match can be trusted.
 *
 * `authoritative` means the coordinates came from the agency itself — a
 * PHIVOLCS epicentre, a PAGASA cyclone centre. `approximate` means the
 * pipeline placed it, which today is every river basin: see
 * `config/basin-geography.ts` and `docs/basin-geometry-investigation.md` for
 * why no authoritative basin polygon set could be adopted.
 *
 * The two are never collapsed. An app told "approximate" can hedge; an app
 * told "authoritative" about a hand-placed circle cannot.
 */
export type GeometryAccuracy = "authoritative" | "approximate";

export interface LocationRelevance {
  type: LocationMatchType;
  /** Null only for `unscoped`, where there is no geometry to rate. */
  accuracy: GeometryAccuracy | null;
  /** Distance to the event's own point, when it has one. */
  distanceKm: number | null;
}

/**
 * Decides whether [event] is worth returning for a reader at [point].
 *
 * Returns null only when the event has real geography and that geography is
 * outside the radius. An event with no usable geography is never excluded:
 * absence of coordinates is not evidence of absence of risk.
 */
export function relevanceTo(
  event: HazardEvent,
  point: GeoPoint,
  radiusKm: number,
): LocationRelevance | null {
  let nearest: number | null = null;

  if (event.location) {
    nearest = distanceKm(event.location, point);
    if (nearest <= radiusKm) {
      // An epicentre or a cyclone centre is the agency's own coordinate.
      return { type: "point", accuracy: "authoritative", distanceKm: nearest };
    }
  }

  let placedAreas = 0;
  for (const area of event.affectedAreas) {
    if (!area.approximateCenter) continue;
    placedAreas++;

    const separation = distanceKm(area.approximateCenter, point);
    if (separation <= radiusKm + (area.approximateRadiusKm ?? 0)) {
      return { type: "area", accuracy: "approximate", distanceKm: nearest };
    }
  }

  const hasGeography = event.location !== null || placedAreas > 0;
  return hasGeography
    ? null
    : { type: "unscoped", accuracy: null, distanceKm: null };
}
