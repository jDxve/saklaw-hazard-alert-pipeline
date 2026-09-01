import * as cheerio from "cheerio";
import {
  MAX_TCWS_SIGNAL,
  MIN_TCWS_SIGNAL,
  PAGASA_AFFECTED_AREAS_LABEL,
  PAGASA_BASIN_ROW_SELECTOR,
  PAGASA_CYCLONE_HEADING_SELECTOR,
  PAGASA_CYCLONE_META_SELECTOR,
  PAGASA_CYCLONE_SCOPE_SELECTOR,
  PAGASA_FLOOD_WATCH_CLASS,
  PAGASA_NON_FLOOD_WATCH_CLASS,
  PAGASA_NO_CYCLONE_PHRASE,
  PAGASA_NO_WIND_SIGNAL_PHRASE,
  PAGASA_PANEL_CENTER,
  PAGASA_PANEL_FORECAST,
  PAGASA_PANEL_HEADING_SELECTOR,
  PAGASA_PANEL_MOVEMENT,
  PAGASA_PANEL_SELECTOR,
  PAGASA_PANEL_STRENGTH,
  PAGASA_PANEL_WIND_SIGNAL,
  PAGASA_SIGNAL_CLASS_PREFIX,
  PH_ISLAND_GROUPS,
} from "../../config/constants";
import {
  CycloneBulletin,
  CycloneCenter,
  ForecastPosition,
  TcwsArea,
} from "../../domain/ports/cyclone-source";
import { RiverBasinStatus } from "../../domain/ports/flood-source";
import { normalizeScrapedText, phCivilTimeToIso } from "./phivolcs.parser";

type Loaded = ReturnType<typeof cheerio.load>;
type Selection = ReturnType<Loaded>;

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
const NO_WIND_SIGNAL_LOWER = normalizeScrapedText(PAGASA_NO_WIND_SIGNAL_PHRASE).toLowerCase();

// --- heading -----------------------------------------------------------------

/**
 * `Tropical Depression "Pilandok"` — the category, then the name in quotes.
 * PAGASA uses curly quotes on some bulletins and straight ones on others.
 */
const STORM_HEADING_REGEX = /^(.*?)[\u0022\u201C\u201D\u2018\u2019]\s*([^\u0022\u201C\u201D\u2018\u2019]+?)\s*[\u0022\u201C\u201D\u2018\u2019]/;

/** The bulletin's own vocabulary, longest first so "Severe Tropical Storm" wins. */
const CATEGORIES = [
  "Super Typhoon",
  "Severe Tropical Storm",
  "Tropical Depression",
  "Tropical Storm",
  "Typhoon",
] as const;

const UNQUOTED_HEADING_REGEX = new RegExp(
  `^\\s*(${CATEGORIES.join("|")})\\s+([A-Za-z\u00C0-\u024F'-]{2,})\\s*$`,
  "i",
);

export interface StormHeading {
  stormName: string;
  category: string | null;
}

/**
 * Reads the storm from the bulletin heading, and only from there.
 *
 * Returns null rather than a fallback name: a bulletin whose heading cannot be
 * read is a bulletin we do not understand, and naming the storm anyway is what
 * produced "TROPICAL STORM WITHIN" from a forecast sentence in the body.
 */
export function parseStormHeading(rawHeading: string): StormHeading | null {
  const heading = normalizeScrapedText(rawHeading);
  if (!heading) return null;

  const quoted = STORM_HEADING_REGEX.exec(heading);
  if (quoted) {
    const stormName = normalizeScrapedText(quoted[2]).toUpperCase();
    const category = normalizeScrapedText(quoted[1]);
    return stormName ? { stormName, category: category || null } : null;
  }

  const unquoted = UNQUOTED_HEADING_REGEX.exec(heading);
  if (unquoted) {
    return {
      stormName: normalizeScrapedText(unquoted[2]).toUpperCase(),
      category: normalizeScrapedText(unquoted[1]),
    };
  }

  return null;
}

// --- issued / valid ----------------------------------------------------------

/** "Issued at 05:00 am, 01 September 2026" */
const ISSUED_AT_REGEX =
  /Issued\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?,?\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i;

/** "(Valid for broadcast until the next advisory to be issued at 11:00 AM today)" */
const VALID_UNTIL_REGEX =
  /valid\s+for\s+broadcast\s+until[^)]*?at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(today|tomorrow)?/i;

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function monthIndex(name: string): number | null {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return index < 0 ? null : index;
}

function to24Hour(hour: number, meridiem: string | undefined): number | null {
  if (!meridiem) return hour <= 23 ? hour : null;
  if (hour < 1 || hour > 12) return null;
  return (hour % 12) + (meridiem.toUpperCase() === "PM" ? 12 : 0);
}

export function parseIssuedAt(rawText: string): string | null {
  const match = ISSUED_AT_REGEX.exec(normalizeScrapedText(rawText));
  if (!match) return null;

  const [, hourRaw, minuteRaw, meridiem, dayRaw, monthRaw, yearRaw] = match;
  const month = monthIndex(monthRaw);
  const hour = to24Hour(Number(hourRaw), meridiem);
  if (month === null || hour === null) return null;

  return phCivilTimeToIso(Number(yearRaw), month, Number(dayRaw), hour, Number(minuteRaw));
}

/**
 * The bulletin states its own expiry — "valid for broadcast until the next
 * advisory to be issued at 11:00 AM today" — as a clock time relative to the
 * day it was issued. Resolving it needs [issuedAtIso], so a bulletin with an
 * unreadable issue time gets no expiry rather than an invented one.
 *
 * "today" is the issue date. A time that lands at or before the issue instant
 * is read as the next day, which is how "issued 11 PM, valid until 5:00 AM"
 * has to be understood; "tomorrow" says so explicitly.
 */
export function parseValidUntil(rawText: string, issuedAtIso: string | null): string | null {
  if (!issuedAtIso) return null;

  const match = VALID_UNTIL_REGEX.exec(normalizeScrapedText(rawText));
  if (!match) return null;

  const [, hourRaw, minuteRaw, meridiem, dayWord] = match;
  const hour = to24Hour(Number(hourRaw), meridiem);
  const minute = Number(minuteRaw);
  if (hour === null || minute > 59) return null;

  const issued = new Date(issuedAtIso);
  if (Number.isNaN(issued.getTime())) return null;

  // Work in Philippine civil time, which is what the bulletin prints.
  const phIssued = new Date(issued.getTime() + PH_OFFSET_MS);
  let candidate = phCivilTimeToIso(
    phIssued.getUTCFullYear(),
    phIssued.getUTCMonth(),
    phIssued.getUTCDate(),
    hour,
    minute,
  );
  if (!candidate) return null;

  const rollForward =
    dayWord?.toLowerCase() === "tomorrow" || new Date(candidate) <= issued;

  if (rollForward) {
    const nextDay = new Date(phIssued.getTime() + 24 * 60 * 60 * 1000);
    candidate = phCivilTimeToIso(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth(),
      nextDay.getUTCDate(),
      hour,
      minute,
    );
  }

  return candidate;
}

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

// --- panels ------------------------------------------------------------------

/** Finds the panel whose heading starts with [heading], case-insensitively. */
function panelByHeading($: Loaded, scope: Selection, heading: string): Selection | null {
  const wanted = heading.toLowerCase();
  const panels = scope.find(PAGASA_PANEL_SELECTOR).filter((_, el) => {
    const text = normalizeScrapedText($(el).find(PAGASA_PANEL_HEADING_SELECTOR).first().text());
    return text.toLowerCase().startsWith(wanted);
  });
  return panels.length > 0 ? panels.first() : null;
}

/** The panel's prose, with its own heading removed. */
function panelBody($: Loaded, panel: Selection): string {
  const clone = panel.clone();
  clone.find(PAGASA_PANEL_HEADING_SELECTOR).remove();
  return normalizeScrapedText(clone.text());
}

/** "( 22.0 °N, 131.9 °E )" — printed only for a located centre. */
const CENTER_COORDS_REGEX =
  /(\d{1,3}(?:\.\d+)?)\s*°?\s*N\s*,\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*E/i;

export function parseCenter(body: string): CycloneCenter | null {
  const description = normalizeScrapedText(body);
  if (!description) return null;

  const match = CENTER_COORDS_REGEX.exec(description);
  return {
    lat: match ? Number(match[1]) : null,
    lon: match ? Number(match[2]) : null,
    description,
  };
}

/** "Maximum sustained winds of 55 km/h ... gustiness of up to 70 km/h" */
const MAX_WINDS_REGEX = /maximum\s+sustained\s+winds\s+of\s+(\d{1,3})\s*km\/h/i;
const GUSTS_REGEX = /gust(?:iness|s)?\s+(?:of\s+)?(?:up\s+to\s+)?(\d{1,3})\s*km\/h/i;

export interface StrengthReading {
  maximumWindsKph: number | null;
  gustsKph: number | null;
}

export function parseStrength(body: string): StrengthReading {
  const text = normalizeScrapedText(body);
  const winds = MAX_WINDS_REGEX.exec(text);
  const gusts = GUSTS_REGEX.exec(text);
  return {
    maximumWindsKph: winds ? Number(winds[1]) : null,
    gustsKph: gusts ? Number(gusts[1]) : null,
  };
}

/** "Sep 01, 2026 02:00 PM - 1,115 km East Northeast of Extreme Northern Luzon" */
const FORECAST_ENTRY_REGEX =
  /([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*/gi;

export function parseForecastPositions(body: string): ForecastPosition[] {
  const text = normalizeScrapedText(body);
  const matches = [...text.matchAll(FORECAST_ENTRY_REGEX)];

  return matches.map((match, index) => {
    const [, monthRaw, dayRaw, yearRaw, hourRaw, minuteRaw, meridiem] = match;
    const month = monthIndex(monthRaw);
    const hour = to24Hour(Number(hourRaw), meridiem);

    // Each entry runs to the start of the next one, so the description keeps
    // PAGASA's own wording including any "(OUTSIDE PAR)" qualifier.
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;

    return {
      at:
        month === null || hour === null
          ? null
          : phCivilTimeToIso(Number(yearRaw), month, Number(dayRaw), hour, Number(minuteRaw)),
      description: normalizeScrapedText(text.slice(start, end)),
    };
  });
}

// --- wind signals ------------------------------------------------------------

export interface WindSignalReading {
  /** Null when PAGASA published its explicit no-signal stand-down. */
  maxSignal: number | null;
  affectedAreas: TcwsArea[];
}

const SIGNAL_CLASS_REGEX = new RegExp(`${PAGASA_SIGNAL_CLASS_PREFIX}([1-5])\\b`, "i");

/**
 * Splits an area list on its top-level commas only.
 *
 * PAGASA nests municipality lists inside parentheses — "the northern portion of
 * mainland Quezon (General Nakar, Infanta)" — so a plain split on "," would cut
 * a single area into fragments and report municipalities as if they were
 * separately named areas.
 */
export function splitAreaClauses(text: string): string[] {
  const clauses: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      clauses.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  clauses.push(current);

  return clauses
    .map((clause) => normalizeScrapedText(clause).replace(/^and\s+/i, "").trim())
    .filter((clause) => clause.length > 0);
}

/**
 * Splits an "Affected Areas" cell into clauses tagged with the island group
 * they were listed under. The cell reads "Luzon <areas> Visayas <areas>", with
 * the group names acting as headings inside the prose.
 */
export function parseAffectedAreaCell(cell: string, signalLevel: number): TcwsArea[] {
  const text = normalizeScrapedText(cell);
  if (!text) return [];

  const groupPattern = new RegExp(`\\b(${PH_ISLAND_GROUPS.join("|")})\\b`, "gi");
  const headings = [...text.matchAll(groupPattern)];

  // No island-group heading: the whole cell is one ungrouped list.
  if (headings.length === 0) {
    return splitAreaClauses(text).map((area) => ({ area, islandGroup: null, signalLevel }));
  }

  const areas: TcwsArea[] = [];

  // Anything before the first heading still belongs to the signal, ungrouped.
  const preamble = text.slice(0, headings[0].index);
  for (const area of splitAreaClauses(preamble)) {
    areas.push({ area, islandGroup: null, signalLevel });
  }

  headings.forEach((heading, index) => {
    const islandGroup = heading[1];
    const start = heading.index + heading[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : text.length;
    for (const area of splitAreaClauses(text.slice(start, end))) {
      areas.push({ area, islandGroup, signalLevel });
    }
  });

  return areas;
}

/**
 * Reads the wind-signal panel.
 *
 * The table repeats `<thead><th class="signalnoN">` followed by that level's
 * own `<tbody>`, descending from 5 to 1. The level comes from the class, so it
 * is read from the markup rather than inferred from row order or from the wind
 * speeds quoted in the prose.
 *
 * Returns null when the panel is missing entirely, which is not the same as a
 * published stand-down and must not be reported as one.
 */
export function parseWindSignals($: Loaded, scope: Selection): WindSignalReading | null {
  const panel = panelByHeading($, scope, PAGASA_PANEL_WIND_SIGNAL);
  if (!panel) return null;

  const table = panel.find("table").first();
  if (table.length === 0) {
    // No table at all: the only reading that means "nothing hoisted" is
    // PAGASA's own phrase. Anything else is a panel we do not understand.
    const body = panelBody($, panel).toLowerCase();
    return body.includes(NO_WIND_SIGNAL_LOWER)
      ? { maxSignal: null, affectedAreas: [] }
      : null;
  }

  const affectedAreas: TcwsArea[] = [];
  let maxSignal: number | null = null;

  table.children("thead").each((_, head) => {
    const th = $(head).find("th").first();
    const match = SIGNAL_CLASS_REGEX.exec(String(th.attr("class") ?? ""));
    if (!match) return;

    const signalLevel = Number(match[1]);
    if (signalLevel < MIN_TCWS_SIGNAL || signalLevel > MAX_TCWS_SIGNAL) return;

    const body = $(head).next("tbody");
    if (body.length === 0) return;

    // Only the row labelled "Affected Areas" carries places; the others are
    // the standing advice text, identical on every bulletin.
    const areaRow = body
      .find("tr")
      .filter((__, row) => {
        const label = normalizeScrapedText($(row).find("td").first().text());
        return label.toLowerCase() === PAGASA_AFFECTED_AREAS_LABEL.toLowerCase();
      })
      .first();
    if (areaRow.length === 0) return;

    const cell = normalizeScrapedText(areaRow.find("td").eq(1).text());
    const areas = parseAffectedAreaCell(cell, signalLevel);
    if (areas.length === 0) return;

    affectedAreas.push(...areas);
    if (maxSignal === null || signalLevel > maxSignal) maxSignal = signalLevel;
  });

  return maxSignal === null ? null : { maxSignal, affectedAreas };
}

// --- bulletin ----------------------------------------------------------------

export function parseCycloneBulletin($: Loaded): CycloneReading {
  // Scoped to the bulletin panel, and only its first block: the page's own
  // navigation names every cyclone product, and the Archive panel below lists
  // past storms — matching against the whole body picks up both as "active".
  const scope = $(PAGASA_CYCLONE_SCOPE_SELECTOR).first();
  if (scope.length === 0) {
    return { kind: "unreadable", reason: "cyclone bulletin panel not found" };
  }

  const scopeText = normalizeScrapedText(scope.text());
  if (scopeText.toLowerCase().includes(NO_CYCLONE_PHRASE_LOWER)) {
    return { kind: "none" };
  }

  const heading = parseStormHeading(
    scope.find(PAGASA_CYCLONE_HEADING_SELECTOR).first().text(),
  );
  if (!heading) {
    return {
      kind: "unreadable",
      reason: "no stand-down phrase and no storm name in the bulletin heading",
    };
  }

  const meta = normalizeScrapedText(
    scope
      .find(PAGASA_CYCLONE_META_SELECTOR)
      .map((_, el) => $(el).text())
      .get()
      .join(" "),
  );
  const issuedAt = parseIssuedAt(meta);

  const windSignals = parseWindSignals($, scope);
  if (!windSignals) {
    return {
      kind: "unreadable",
      reason: "wind signal panel missing or not understood",
    };
  }

  const centerPanel = panelByHeading($, scope, PAGASA_PANEL_CENTER);
  const movementPanel = panelByHeading($, scope, PAGASA_PANEL_MOVEMENT);
  const strengthPanel = panelByHeading($, scope, PAGASA_PANEL_STRENGTH);
  const forecastPanel = panelByHeading($, scope, PAGASA_PANEL_FORECAST);

  const strength = strengthPanel
    ? parseStrength(panelBody($, strengthPanel))
    : { maximumWindsKph: null, gustsKph: null };

  return {
    kind: "active",
    bulletin: {
      stormName: heading.stormName,
      category: heading.category,
      maxSignal: windSignals.maxSignal,
      issuedAt,
      validUntil: parseValidUntil(meta, issuedAt),
      center: centerPanel ? parseCenter(panelBody($, centerPanel)) : null,
      movement: movementPanel ? panelBody($, movementPanel) || null : null,
      maximumWindsKph: strength.maximumWindsKph,
      gustsKph: strength.gustsKph,
      forecastPositions: forecastPanel
        ? parseForecastPositions(panelBody($, forecastPanel))
        : [],
      affectedAreas: windSignals.affectedAreas,
    },
  };
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
