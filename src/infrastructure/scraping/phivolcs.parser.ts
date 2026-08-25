import * as cheerio from "cheerio";
import { MAG_MAX, MAG_MIN, PH_BOUNDS } from "../../config/constants";

export interface ParsedQuakeRow {
  dateRaw: string;
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  location: string;
}

export function parsePhivolcsDate(rawStr: string): string | null {
  try {
    const cleaned = rawStr.replace(/\s+/g, " ").trim();
    const date = new Date(`${cleaned} GMT+0800`);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

export function parseQuakeRow(
  $: ReturnType<typeof cheerio.load>,
  row: cheerio.Element,
): ParsedQuakeRow | null {
  const cols = $(row).find("td");
  if (cols.length < 6) return null;

  const dateRaw   = $(cols[0]).text().trim();
  const lat       = parseFloat($(cols[1]).text().trim());
  const lon       = parseFloat($(cols[2]).text().trim());
  const depthKm   = parseInt($(cols[3]).text().trim(), 10);
  const magnitude = parseFloat($(cols[4]).text().trim());
  const location  = $(cols[5]).text().trim();

  if (
    isNaN(lat) || isNaN(lon) || isNaN(magnitude) || isNaN(depthKm) ||
    lat       < PH_BOUNDS.latMin || lat       > PH_BOUNDS.latMax ||
    lon       < PH_BOUNDS.lonMin || lon       > PH_BOUNDS.lonMax ||
    magnitude < MAG_MIN          || magnitude > MAG_MAX
  ) {
    return null;
  }

  return { dateRaw, lat, lon, depthKm, magnitude, location };
}
