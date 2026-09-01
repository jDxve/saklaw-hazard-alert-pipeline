import * as cheerio from "cheerio";
import { MAG_MAX, MAG_MIN, PH_BOUNDS, PH_UTC_OFFSET_MINUTES } from "../../config/constants";

export interface ParsedQuakeRow {
  dateRaw: string;
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  location: string;
}

/**
 * PHIVOLCS publishes bulletin timestamps as e.g. "25 August 2026 - 02:15 PM",
 * in Philippine Standard Time with no zone marker.
 *
 * This is parsed explicitly rather than handed to `new Date(string)`: for a
 * non-ISO format V8 falls back to a legacy parser that is both too strict
 * (it rejects the " - " separator PHIVOLCS actually uses) and too lenient
 * (it reads "not a date GMT+0800" as the year 0800). Either behaviour is
 * wrong here — the first silently drops every real quake row, the second
 * invents a timestamp for garbage.
 */
const PHIVOLCS_DATE_REGEX =
  /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*(?:[-–—]\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;

const MONTH_INDEX_BY_PREFIX: ReadonlyMap<string, number> = new Map([
  ["jan", 0], ["feb", 1], ["mar", 2], ["apr", 3], ["may", 4], ["jun", 5],
  ["jul", 6], ["aug", 7], ["sep", 8], ["oct", 9], ["nov", 10], ["dec", 11],
]);

/**
 * Collapses the whitespace scraped HTML carries into single spaces.
 * `\s` already covers the non-breaking space that `&nbsp;` decodes to,
 * along with the newlines and runs of spaces the source markup introduces.
 */
export function normalizeScrapedText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Converts a PHIVOLCS local timestamp into an ISO-8601 UTC string.
 * Returns null for anything that is not a well-formed, real calendar date.
 */
export function parsePhivolcsDate(rawStr: string): string | null {
  const match = PHIVOLCS_DATE_REGEX.exec(normalizeScrapedText(rawStr));
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw, secondRaw, meridiem] = match;

  const month = MONTH_INDEX_BY_PREFIX.get(monthRaw.slice(0, 3).toLowerCase());
  if (month === undefined) return null;

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  const minute = Number(minuteRaw);
  const second = secondRaw ? Number(secondRaw) : 0;
  let hour = Number(hourRaw);

  if (minute > 59 || second > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }

  return phCivilTimeToIso(year, month, day, hour, minute, second);
}

/**
 * Converts a Philippine civil date-time into an ISO-8601 UTC string, or null
 * when the components do not name a real calendar date.
 *
 * Shared with the PAGASA parser: both sources print local time with no zone
 * marker, and both need the same refusal to invent one.
 */
export function phCivilTimeToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): string | null {
  // Date.UTC silently rolls impossible dates forward ("31 February" -> 3 March),
  // so round-trip the components to reject them instead of inventing a date.
  const civilMs = Date.UTC(year, month, day, hour, minute, second);
  const civil = new Date(civilMs);
  if (
    civil.getUTCFullYear() !== year ||
    civil.getUTCMonth() !== month ||
    civil.getUTCDate() !== day
  ) {
    return null;
  }

  return new Date(civilMs - PH_UTC_OFFSET_MINUTES * 60_000).toISOString();
}

const QUAKE_COLUMN_COUNT = 6;

export function parseQuakeRow(
  $: ReturnType<typeof cheerio.load>,
  row: cheerio.Element,
): ParsedQuakeRow | null {
  const cols = $(row).find("td");
  if (cols.length < QUAKE_COLUMN_COUNT) return null;

  const cell = (index: number): string => normalizeScrapedText($(cols[index]).text());

  const dateRaw   = cell(0);
  const lat       = parseFloat(cell(1));
  const lon       = parseFloat(cell(2));
  const depthKm   = parseInt(cell(3), 10);
  const magnitude = parseFloat(cell(4));
  const location  = cell(5);

  const withinPhilippines =
    lat >= PH_BOUNDS.latMin && lat <= PH_BOUNDS.latMax &&
    lon >= PH_BOUNDS.lonMin && lon <= PH_BOUNDS.lonMax;
  const plausibleMagnitude = magnitude >= MAG_MIN && magnitude <= MAG_MAX;

  // NaN fails every comparison above, so unparseable cells are rejected here too.
  if (!withinPhilippines || !plausibleMagnitude || Number.isNaN(depthKm)) return null;

  return { dateRaw, lat, lon, depthKm, magnitude, location };
}
