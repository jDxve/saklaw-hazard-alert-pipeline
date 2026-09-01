import { FLOOD_WATCH_VALID_FOR_MS } from "../../config/constants";
import { HazardEvent, HazardType } from "../entities/hazard-event";

/**
 * How long an event stays current when its source published no expiry.
 *
 * These are the pipeline's rules, not the agencies'. They exist because the
 * store is append-only: without them a typhoon bulletin from last November
 * would still read as active today. Anything with a real `validUntil` uses
 * that instead and never reaches this table.
 */
export const FALLBACK_LIFETIME_MS: Readonly<Record<HazardType, number>> = {
  // PAGASA bulletins every 6 hours; one missed cycle still counts as current.
  cyclone: 6 * 60 * 60 * 1000,
  // A quake is instantaneous. This is "recent enough to still matter to a
  // reader", not a claim that shaking continues.
  quake: 24 * 60 * 60 * 1000,
  flood: FLOOD_WATCH_VALID_FOR_MS,
  volcanic: 24 * 60 * 60 * 1000,
  severeWeather: 6 * 60 * 60 * 1000,
};

/**
 * Whether the source's statement is still current at [now].
 *
 * Prefers the agency's own validity when it published one — PAGASA prints
 * "valid for broadcast until ..." on every cyclone bulletin — and falls back
 * to a per-type lifetime otherwise. An unparseable `issuedAt` is treated as
 * not active rather than as forever.
 */
export function isActiveAt(event: HazardEvent, now: Date): boolean {
  if (event.validUntil !== null) {
    const expiry = Date.parse(event.validUntil);
    return Number.isNaN(expiry) ? false : now.getTime() < expiry;
  }

  const issued = Date.parse(event.issuedAt);
  if (Number.isNaN(issued)) return false;

  return now.getTime() - issued < FALLBACK_LIFETIME_MS[event.type];
}

/** Why the event is or is not current, so the API can say rather than imply. */
export function lifecycleBasis(event: HazardEvent): "source" | "pipeline" {
  return event.validUntil !== null ? "source" : "pipeline";
}
