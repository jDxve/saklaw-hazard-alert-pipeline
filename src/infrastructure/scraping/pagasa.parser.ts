import * as cheerio from "cheerio";
import {
  MIN_TCWS_SIGNAL,
  PAGASA_BASIN_ROW_SELECTOR,
  PAGASA_CYCLONE_SCOPE_SELECTOR,
  PAGASA_FLOOD_WATCH_CLASS,
  PAGASA_NO_CYCLONE_PHRASE,
  PAGASA_NON_FLOOD_WATCH_CLASS,
} from "../../config/constants";
import { CycloneBulletin } from "../../domain/ports/cyclone-source";
import { RiverBasinStatus } from "../../domain/ports/flood-source";
import { normalizeScrapedText } from "./phivolcs.parser";

type Loaded = ReturnType<typeof cheerio.load>;

/**
 * Matches every way PAGASA writes a wind signal — "TCWS No. 3", "Signal No.3",
 * "Wind Signal #2" — in one pass, rather than testing a fixed list of literal
 * substrings that a spacing or punctuation change upstream would silently break.
 */
const TCWS_SIGNAL_REGEX = /(?:TCWS|(?:Wind\s*)?Signal)\s*(?:No\.?|Number)?\s*#?\s*([1-5])\b/gi;

export function detectMaxTcwsSignal(text: string): number {
  const haystack = normalizeScrapedText(text);

  let maxSignal = MIN_TCWS_SIGNAL;
  for (const match of haystack.matchAll(TCWS_SIGNAL_REGEX)) {
    const signal = Number(match[1]);
    if (signal > maxSignal) maxSignal = signal;
  }
  return maxSignal;
}

const STORM_NAME_REGEX =
  /(SUPER TYPHOON|TYPHOON|SEVERE TROPICAL STORM|TROPICAL STORM|TROPICAL DEPRESSION)\s+([A-Z]+)/i;

export const FALLBACK_STORM_NAME = "Active Tropical Cyclone";

export function extractStormName(text: string): string {
  const match = STORM_NAME_REGEX.exec(normalizeScrapedText(text));
  return match
    ? `${match[1].toUpperCase()} ${match[2].toUpperCase()}`
    : FALLBACK_STORM_NAME;
}

/**
 * What the bulletin page said, kept as three distinct answers.
 *
 * "Unreadable" exists because it is not the same as "no cyclone": if the page
 * layout moves and we silently report calm, the app shows an all-clear it has
 * no evidence for. Only an explicit stand-down counts as calm.
 */
export type CycloneReading =
  | { kind: "none" }
  | { kind: "active"; bulletin: CycloneBulletin }
  | { kind: "unreadable"; reason: string };

const NO_CYCLONE_PHRASE_LOWER = normalizeScrapedText(PAGASA_NO_CYCLONE_PHRASE).toLowerCase();

export function parseCycloneBulletin($: Loaded): CycloneReading {
  // Scoped to the bulletin panel, and only its first block: the page's own
  // navigation names every cyclone product, and the Archive panel below lists
  // past storms — matching against the whole body picks up both as "active".
  const panel = $(PAGASA_CYCLONE_SCOPE_SELECTOR).first();
  if (panel.length === 0) {
    return { kind: "unreadable", reason: "cyclone bulletin panel not found" };
  }

  const text = normalizeScrapedText(panel.text());
  if (text.toLowerCase().includes(NO_CYCLONE_PHRASE_LOWER)) {
    return { kind: "none" };
  }

  const maxSignal = detectMaxTcwsSignal(text);
  const stormName = extractStormName(text);

  // Require positive evidence of a live bulletin. Absence of the stand-down
  // phrase alone is not enough to wake anyone up.
  if (maxSignal === MIN_TCWS_SIGNAL && stormName === FALLBACK_STORM_NAME) {
    return { kind: "unreadable", reason: "no stand-down phrase and no bulletin content" };
  }

  return { kind: "active", bulletin: { stormName, maxSignal } };
}

export interface BasinTableReading {
  monitored: number;
  onWatch: RiverBasinStatus[];
}

/**
 * Reads the "18 MAJOR RIVER BASINS" table. Status is carried in a CSS class on
 * each row's link — `flood` or `non-flood` — which is a far steadier signal than
 * the surrounding prose: the page also carries a permanent explainer naming
 * every bulletin category ("Flood Outlook, Flood Advisory, Flood Warning and
 * Critical Flood Warning"), so any text search over the whole body matches on a
 * completely dry day.
 */
export function parseRiverBasinTable($: Loaded): BasinTableReading {
  const onWatch: RiverBasinStatus[] = [];
  let monitored = 0;

  $(PAGASA_BASIN_ROW_SELECTOR).each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const name = normalizeScrapedText($(cells[0]).text());
    if (!name) return;

    const status = $(cells[1]).find(`.${PAGASA_FLOOD_WATCH_CLASS}, .${PAGASA_NON_FLOOD_WATCH_CLASS}`).first();
    if (status.length === 0) return;

    monitored++;
    if (status.hasClass(PAGASA_FLOOD_WATCH_CLASS)) {
      onWatch.push({ name, bulletinUrl: status.attr("href") ?? null });
    }
  });

  return { monitored, onWatch };
}
