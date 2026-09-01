import { z } from "zod";
import { GeoPoint, HazardType } from "../../domain/entities/hazard-event";
import { HazardQueryRequest } from "../../application/use-cases/query-hazards.use-case";

export const HAZARD_TYPES = [
  "quake",
  "volcanic",
  "cyclone",
  "flood",
  "severeWeather",
] as const;

export const DEFAULT_RADIUS_KM = 100;
export const MAX_RADIUS_KM = 1000;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A month back. Beyond this a client is asking for an archive, not a feed. */
export const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Query parameters, validated rather than trusted.
 *
 * `lat` and `lon` must arrive together: a half-specified point would silently
 * widen a location query into a national one, which is the kind of quiet
 * fallback that makes an app claim coverage it does not have.
 */
const querySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(MAX_RADIUS_KM).optional(),
    type: z.string().optional(),
    since: z.string().optional(),
    limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
    activeOnly: z.enum(["true", "false"]).optional(),
  })
  .refine((value) => (value.lat === undefined) === (value.lon === undefined), {
    message: "lat and lon must be supplied together",
  });

export type QueryParseResult =
  | { ok: true; request: HazardQueryRequest }
  | { ok: false; error: string };

export function parseHazardQuery(
  raw: Record<string, unknown>,
  now: Date,
): QueryParseResult {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const value = parsed.data;

  const types: HazardType[] = [];
  if (value.type) {
    for (const candidate of value.type.split(",").map((t) => t.trim()).filter(Boolean)) {
      if (!(HAZARD_TYPES as readonly string[]).includes(candidate)) {
        return { ok: false, error: `unknown hazard type "${candidate}"` };
      }
      types.push(candidate as HazardType);
    }
  }

  const earliest = new Date(now.getTime() - MAX_WINDOW_MS);
  let since = new Date(now.getTime() - DEFAULT_WINDOW_MS);
  if (value.since) {
    const requested = new Date(value.since);
    if (Number.isNaN(requested.getTime())) {
      return { ok: false, error: "since must be an ISO-8601 timestamp" };
    }
    // Clamped rather than rejected: a client asking for more history than the
    // window allows gets the window, not an error it cannot act on.
    since = requested < earliest ? earliest : requested;
  }

  const at: GeoPoint | null =
    value.lat !== undefined && value.lon !== undefined
      ? { lat: value.lat, lon: value.lon }
      : null;

  return {
    ok: true,
    request: {
      types,
      at,
      radiusKm: value.radiusKm ?? DEFAULT_RADIUS_KM,
      since: since.toISOString(),
      limit: value.limit ?? DEFAULT_LIMIT,
      // Defaults to true: "what should I worry about now" is the question the
      // app actually asks, and a lapsed bulletin answering it is a bug.
      activeOnly: value.activeOnly !== "false",
    },
  };
}
