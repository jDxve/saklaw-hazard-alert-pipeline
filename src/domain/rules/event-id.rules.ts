import { SeverityLevel } from "../entities/hazard-event";
import { QuakeObservation } from "../ports/quake-source";

/**
 * PHIVOLCS timestamps have minute resolution, so the timestamp alone is not a
 * unique key — two distinct quakes reported in the same minute would collide
 * and the second would be discarded as a duplicate. Position and magnitude
 * make the key identify the event rather than the minute it landed in.
 */
export function quakeEventId(observation: QuakeObservation): string {
  const epochMs = Date.parse(observation.occurredAt);
  const lat = observation.lat.toFixed(2);
  const lon = observation.lon.toFixed(2);
  const magnitude = observation.magnitude.toFixed(1);
  return `phivolcs_eq_${epochMs}_${lat}_${lon}_m${magnitude}`;
}

/** `2026-08-25T06` — the UTC hour an advisory falls in. */
export function hourBucket(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 13);
}

/**
 * Bucketing by hour alone suppresses escalations: a cyclone strengthening from
 * Signal 2 to Signal 5 inside one hour would match the existing document and
 * never be pushed — silencing the alert that matters most. Keying on the signal
 * as well makes each distinct severity within the hour its own event.
 */
export function cycloneEventId(issuedAt: string, maxSignal: number | null): string {
  // "none" rather than 0: a bulletin with no signal hoisted is its own state,
  // and must not collide with a future Signal #0 or read as one.
  return `pagasa_tc_${hourBucket(issuedAt)}_s${maxSignal ?? "none"}`;
}

/**
 * Which basins are on watch is the thing that changes during an event, so it is
 * part of the key: a flood spreading to new basins inside one hour is new
 * information and has to reach people, not collapse into the existing document.
 * The names are hashed to keep the document id short and stable.
 */
export function floodEventId(
  issuedAt: string,
  severity: SeverityLevel,
  basinsOnWatch: readonly string[],
): string {
  return `pagasa_flood_${hourBucket(issuedAt)}_${severity}_${fingerprint(basinsOnWatch)}`;
}

/** Small deterministic FNV-1a digest — order-independent via the sort. */
function fingerprint(values: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of [...values].sort().join("|")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
