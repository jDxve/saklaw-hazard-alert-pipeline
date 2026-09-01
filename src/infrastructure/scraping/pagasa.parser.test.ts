import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import {
  parseAffectedAreaCell,
  parseCenter,
  parseCycloneBulletin,
  parseForecastPositions,
  parseIssuedAt,
  parseRiverBasinTable,
  parseStormHeading,
  parseStrength,
  parseValidUntil,
  splitAreaClauses,
} from "./pagasa.parser";

// --- storm heading ----------------------------------------------------------

test("parseStormHeading reads the quoted name from the bulletin heading", () => {
  assert.deepEqual(parseStormHeading('Tropical Depression "Pilandok"'), {
    stormName: "PILANDOK",
    category: "Tropical Depression",
  });
});

test("parseStormHeading handles PAGASA's curly quotes", () => {
  assert.deepEqual(parseStormHeading("Super Typhoon “Pepito”"), {
    stormName: "PEPITO",
    category: "Super Typhoon",
  });
});

test("parseStormHeading accepts an unquoted heading", () => {
  assert.deepEqual(parseStormHeading("Severe Tropical Storm Kristine"), {
    stormName: "KRISTINE",
    category: "Severe Tropical Storm",
  });
});

test("parseStormHeading refuses prose rather than inventing a name", () => {
  // The exact sentence that produced "TROPICAL STORM WITHIN" in production.
  assert.equal(
    parseStormHeading(
      "PILANDOK is forecast to intensify into a tropical storm within the next 12 hours",
    ),
    null,
  );
  assert.equal(parseStormHeading(""), null);
});

// --- issued / valid ---------------------------------------------------------

test("parseIssuedAt reads PAGASA's own issue stamp as UTC", () => {
  // 05:00 PHT on 01 September 2026 is 21:00 UTC the previous day.
  assert.equal(
    parseIssuedAt("Issued at 05:00 am, 01 September 2026"),
    "2026-08-31T21:00:00.000Z",
  );
});

test("parseIssuedAt returns null for anything it cannot read", () => {
  assert.equal(parseIssuedAt("Issued sometime yesterday"), null);
  assert.equal(parseIssuedAt("Issued at 05:00 am, 31 February 2026"), null);
});

test("parseValidUntil resolves the next-advisory time against the issue date", () => {
  const issued = "2026-08-31T21:00:00.000Z"; // 05:00 PHT, 01 Sep
  assert.equal(
    parseValidUntil(
      "(Valid for broadcast until the next advisory to be issued at 11:00 AM today)",
      issued,
    ),
    "2026-09-01T03:00:00.000Z", // 11:00 PHT, same day
  );
});

test("parseValidUntil rolls past midnight rather than expiring in the past", () => {
  const issued = "2026-09-01T15:00:00.000Z"; // 11:00 PM PHT, 01 Sep
  assert.equal(
    parseValidUntil("(Valid for broadcast until ... to be issued at 5:00 AM tomorrow)", issued),
    "2026-09-01T21:00:00.000Z", // 05:00 PHT, 02 Sep
  );
});

test("parseValidUntil gives no expiry when the issue time is unknown", () => {
  // An expiry is only meaningful relative to a known issue instant; guessing
  // one would let the API call a stale bulletin active.
  assert.equal(parseValidUntil("valid for broadcast until ... at 11:00 AM today", null), null);
});

// --- panels -----------------------------------------------------------------

test("parseCenter keeps the sentence and lifts the coordinates", () => {
  const center = parseCenter(
    "The center of Tropical Depression PILANDOK was estimated based on all " +
      "available data at 1,050 km East of Extreme Northern Luzon (22.0 °N, 131.9 °E )",
  );
  assert.equal(center?.lat, 22.0);
  assert.equal(center?.lon, 131.9);
  assert.match(center?.description ?? "", /^The center of Tropical Depression PILANDOK/);
});

test("parseCenter reports no coordinates rather than a guess", () => {
  const center = parseCenter("The center was estimated over the Philippine Sea");
  assert.equal(center?.lat, null);
  assert.equal(center?.lon, null);
});

test("parseStrength reads sustained winds and gusts separately", () => {
  assert.deepEqual(
    parseStrength(
      "Maximum sustained winds of 55 km/h near the center and gustiness of up to 70 km/h",
    ),
    { maximumWindsKph: 55, gustsKph: 70 },
  );
});

test("parseStrength leaves what is not published as null", () => {
  assert.deepEqual(parseStrength("Strength being assessed"), {
    maximumWindsKph: null,
    gustsKph: null,
  });
});

test("parseForecastPositions splits the track and keeps each description", () => {
  const positions = parseForecastPositions(
    "Sep 01, 2026 02:00 PM - 1,115 km East Northeast of Extreme Northern Luzon " +
      "Sep 02, 2026 02:00 AM - 1,135 km East Northeast of Extreme Northern Luzon " +
      "Sep 03, 2026 02:00 AM - 1,020 km East Northeast of Extreme Northern Luzon (OUTSIDE PAR)",
  );

  assert.equal(positions.length, 3);
  assert.equal(positions[0].at, "2026-09-01T06:00:00.000Z");
  assert.equal(positions[0].description, "1,115 km East Northeast of Extreme Northern Luzon");
  // The qualifier belongs to the forecast and is not dropped.
  assert.match(positions[2].description, /\(OUTSIDE PAR\)$/);
});

// --- affected areas ---------------------------------------------------------

test("splitAreaClauses does not cut inside a parenthesised municipality list", () => {
  assert.deepEqual(
    splitAreaClauses(
      "the northern portion of mainland Quezon (General Nakar, Infanta), Calaguas Islands",
    ),
    ["the northern portion of mainland Quezon (General Nakar, Infanta)", "Calaguas Islands"],
  );
});

test("parseAffectedAreaCell tags each clause with its island group and signal", () => {
  const areas = parseAffectedAreaCell(
    "Luzon Albay, the rest of Camarines Sur Visayas Northern Samar",
    2,
  );

  assert.deepEqual(areas, [
    { area: "Albay", islandGroup: "Luzon", signalLevel: 2 },
    { area: "the rest of Camarines Sur", islandGroup: "Luzon", signalLevel: 2 },
    { area: "Northern Samar", islandGroup: "Visayas", signalLevel: 2 },
  ]);
});

test("parseAffectedAreaCell returns nothing for an empty cell", () => {
  assert.deepEqual(parseAffectedAreaCell("   ", 3), []);
});

// --- cyclone bulletin -------------------------------------------------------

/** Mirrors the real page: site nav, then the bulletin panel, then the archive. */
function cyclonePage(bulletinHtml: string, archiveHtml = ""): string {
  return `
    <nav>
      <ul>
        <li><a href="/tropical-cyclone/tropical-cyclone-advisory">Tropical Cyclone Advisory</a></li>
        <li><a href="/tropical-cyclone/severe-weather-bulletin">Tropical Cyclone Bulletin</a></li>
      </ul>
    </nav>
    <div class="row tropical-cyclone-weather-bulletin-page">
      <div class="col-md-12">
        <div class="article-header"><span>Tropical Cyclone Bulletin</span></div>
        <div class="article-content">${bulletinHtml}</div>
      </div>
      <div class="col-md-12">
        <div class="article-header"><span>Archive</span></div>
        <div class="article-content">${archiveHtml}</div>
      </div>
    </div>`;
}

const STAND_DOWN =
  "<h3>No Active Tropical Cyclone within the Philippine Area of Responsibility</h3>";

function panel(heading: string, body: string): string {
  return `<div class="panel"><div class="panel-heading">${heading}</div>
          <div class="panel-body">${body}</div></div>`;
}

/**
 * The live bulletin of 01 September 2026, reduced to the elements the parser
 * reads. Tropical Depression Pilandok was active in PAR with **no** wind
 * signal hoisted anywhere.
 */
const PILANDOK_BULLETIN = `
  <div class="col-md-6 col-sm-5 col-xs-4 text-center">
    <h3>Tropical Depression "Pilandok"</h3>
  </div>
  <div class="col-md-6 col-sm-7 col-xs-8 text-center">
    <h5>Issued at 05:00 am, 01 September 2026</h5>
    <h5>(Valid for broadcast until the next advisory to be issued at 11:00 AM today)</h5>
  </div>
  <div class="col-md-6">
    <h5>PILANDOK MAINTAINS ITS STRENGTH AS IT MOVES WEST NORTHWESTWARD.</h5>
  </div>
  <p>PILANDOK is forecast to intensify into a tropical storm within the next 12 hours
     and may remain as a tropical storm as it moves away from the Philippine landmass.</p>
  ${panel(
    "Location of Eye/center",
    "The center of Tropical Depression PILANDOK was estimated based on all available " +
      "data at 1,050 km East of Extreme Northern Luzon (22.0 °N, 131.9 °E )",
  )}
  ${panel("Movement", "Moving West Northwestward at 10 km/h")}
  ${panel(
    "Strength",
    "Maximum sustained winds of 55 km/h near the center and gustiness of up to 70 km/h",
  )}
  ${panel(
    "Forecast Position",
    "Sep 01, 2026 02:00 PM - 1,115 km East Northeast of Extreme Northern Luzon " +
      "Sep 02, 2026 02:00 AM - 1,135 km East Northeast of Extreme Northern Luzon",
  )}
  ${panel("Wind Signal", "<span>No Tropical Cyclone Wind Signal</span>")}`;

test("parseCycloneBulletin reports calm on the explicit stand-down phrase", () => {
  assert.deepEqual(parseCycloneBulletin(cheerio.load(cyclonePage(STAND_DOWN))), { kind: "none" });
});

test("parseCycloneBulletin ignores past storms listed in the archive panel", () => {
  const archive = "<ul><li>TYPHOON OBET TCB#1_obet.pdf</li><li>Signal No. 4</li></ul>";
  assert.equal(parseCycloneBulletin(cheerio.load(cyclonePage(STAND_DOWN, archive))).kind, "none");
});

test("parseCycloneBulletin names Pilandok from the heading, not from the prose", () => {
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(PILANDOK_BULLETIN)));
  assert.equal(reading.kind, "active");
  if (reading.kind !== "active") return;

  // The regression this exists for: the body says "...intensify into a tropical
  // storm within the next 12 hours", and the old body-wide regex published that
  // as the storm's name.
  assert.equal(reading.bulletin.stormName, "PILANDOK");
  assert.notEqual(reading.bulletin.stormName, "TROPICAL STORM WITHIN");
  assert.equal(reading.bulletin.category, "Tropical Depression");
});

test("parseCycloneBulletin reports no wind signal as null, never as Signal 1", () => {
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(PILANDOK_BULLETIN)));
  assert.equal(reading.kind, "active");
  if (reading.kind !== "active") return;

  // "No Tropical Cyclone Wind Signal" is a stand-down. Reporting it as signal 1
  // claims PAGASA hoisted a signal it explicitly did not.
  assert.equal(reading.bulletin.maxSignal, null);
  assert.notEqual(reading.bulletin.maxSignal, 1);
  assert.deepEqual(reading.bulletin.affectedAreas, []);
});

test("parseCycloneBulletin carries Pilandok's full published detail", () => {
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(PILANDOK_BULLETIN)));
  assert.equal(reading.kind, "active");
  if (reading.kind !== "active") return;
  const bulletin = reading.bulletin;

  assert.equal(bulletin.issuedAt, "2026-08-31T21:00:00.000Z");
  assert.equal(bulletin.validUntil, "2026-09-01T03:00:00.000Z");
  assert.equal(bulletin.center?.lat, 22.0);
  assert.equal(bulletin.center?.lon, 131.9);
  assert.equal(bulletin.movement, "Moving West Northwestward at 10 km/h");
  assert.equal(bulletin.maximumWindsKph, 55);
  assert.equal(bulletin.gustsKph, 70);
  assert.equal(bulletin.forecastPositions.length, 2);
});

/** The wind-signal table as PAGASA builds it: one thead+tbody pair per level. */
function signalBlock(level: number, areas: string): string {
  return `
    <thead><tr><th colspan="2" class="signalno${level}">Tropical Cyclone Wind Signal no.
      <img src="/icons/tcws${level}.png"></th></tr></thead>
    <tbody>
      <tr><td class="bg-danger"><strong>Affected Areas</strong></td><td>${areas}</td></tr>
      <tr><td class="bg-info">Meteorological Condition</td><td>Winds may be expected.</td></tr>
      <tr><td class="bg-info">What To Do</td><td>Standing advice, identical every bulletin.</td></tr>
    </tbody>`;
}

const PEPITO_BULLETIN = `
  <div class="col-md-6 text-center"><h3>Super Typhoon "Pepito"</h3></div>
  <div class="col-md-6 text-center">
    <h5>Issued at 08:00 am, 17 November 2024</h5>
    <h5>(Valid for broadcast until the next advisory to be issued at 11:00 AM today)</h5>
  </div>
  ${panel("Location of Eye/center", "over the coastal waters of Vinzons, Camarines Norte (14.9 °N, 123.1 °E )")}
  ${panel("Strength", "Maximum sustained winds of 185 km/h near the center and gustiness of up to 230 km/h")}
  <div class="panel">
    <div class="panel-heading">Wind Signal <a href="/signals_pepito.png">(Areas with TCWS)</a></div>
    <table class="table text-center table-header">
      ${signalBlock(5, "Luzon The eastern portion of Polillo Islands (Patnanungan, Jomalig) and Calaguas Islands")}
      ${signalBlock(3, "Luzon Albay, the rest of Camarines Sur Visayas Northern Samar")}
    </table>
  </div>`;

test("parseCycloneBulletin reads the signal level from the table's own class", () => {
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(PEPITO_BULLETIN)));
  assert.equal(reading.kind, "active");
  if (reading.kind !== "active") return;

  assert.equal(reading.bulletin.stormName, "PEPITO");
  // Read off `th class="signalno5"`, not inferred from row order or wind speeds.
  assert.equal(reading.bulletin.maxSignal, 5);
});

test("parseCycloneBulletin attributes each area to the signal it was listed under", () => {
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(PEPITO_BULLETIN)));
  assert.equal(reading.kind, "active");
  if (reading.kind !== "active") return;

  const areas = reading.bulletin.affectedAreas;
  assert.deepEqual(
    areas.filter((a) => a.signalLevel === 5).map((a) => a.area),
    ["The eastern portion of Polillo Islands (Patnanungan, Jomalig) and Calaguas Islands"],
  );
  assert.deepEqual(
    areas.filter((a) => a.signalLevel === 3).map((a) => a.area),
    ["Albay", "the rest of Camarines Sur", "Northern Samar"],
  );
  assert.equal(areas.find((a) => a.area === "Northern Samar")?.islandGroup, "Visayas");
});

test("parseCycloneBulletin reports unreadable when the bulletin panel is gone", () => {
  const reading = parseCycloneBulletin(cheerio.load("<html><body><nav>Tropical Cyclone</nav></body></html>"));
  assert.equal(reading.kind, "unreadable");
});

test("parseCycloneBulletin will not call it calm without evidence either way", () => {
  // Panel present, no stand-down, no heading — we know nothing, and saying
  // "no cyclone" here would be an all-clear we cannot support.
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage("<p>Under maintenance.</p>")));
  assert.equal(reading.kind, "unreadable");
});

test("parseCycloneBulletin will not guess when the wind signal panel is missing", () => {
  // A named storm with no readable signal panel is not a storm with no signal.
  const noPanel = `<div class="col-md-6"><h3>Typhoon "Obet"</h3></div>
                   <h5>Issued at 05:00 am, 01 September 2026</h5>`;
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(noPanel)));
  assert.equal(reading.kind, "unreadable");
});

// --- river basin table ------------------------------------------------------

/**
 * The permanent explainer that sits on the flood page on every day of the year.
 * It names each bulletin category, which is why any text search over the page
 * body reports a flood even when every basin is clear.
 */
const PERMANENT_EXPLAINER = `
  <div class="article-content">
    <p>Flood Bulletin is categorized into four (4) kinds of warning namely:
       Flood Outlook, Flood Advisory, Flood Warning and Critical Flood Warning.</p>
    <p>The Flood Warning Information which is issued by PAGASA is the supplemental
       and periodical information on Flood Warning to the inhabitants.</p>
  </div>`;

function basinRow(name: string, onWatch: boolean): string {
  const cls = onWatch ? "flood" : "non-flood";
  const label = onWatch ? "Flood Watch" : "Non-Flood Watch";
  const slug = name.toLowerCase().replace(/\s+/g, "");
  return `<tr>
    <td>${name}</td>
    <td class='text-center'>
      <a href='https://pubfiles.pagasa.dost.gov.ph/pagasaweb/files/hmd/riverbasin/${slug}.pdf'
         class='${cls}'>${label}</a>
    </td>
  </tr>`;
}

function floodPage(rows: string): string {
  return `${PERMANENT_EXPLAINER}
    <div class="col-md-7 basin-hydro-forecast">
      <div class="panel">
        <div class="panel-heading">Basin Hydrological Forecast</div>
        <table class="table">
          <thead><tr><th>18 MAJOR RIVER BASINS</th><th>STATUS</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

test("parseRiverBasinTable returns only the basins on flood watch", () => {
  const html = floodPage([
    basinRow("Pampanga", true),
    basinRow("Agno", true),
    basinRow("Bicol", false),
    basinRow("Cagayan", false),
  ].join(""));

  const { monitored, onWatch } = parseRiverBasinTable(cheerio.load(html));

  assert.equal(monitored, 4);
  assert.deepEqual(onWatch.map((basin) => basin.name), ["Pampanga", "Agno"]);
});

test("parseRiverBasinTable reports no watch when every basin is clear", () => {
  // The regression that matters: this page still carries the explainer naming
  // "Flood Warning", which previously made the pipeline alert every hour.
  const html = floodPage([
    basinRow("Pampanga", false),
    basinRow("Agno", false),
    basinRow("Bicol", false),
  ].join(""));

  const { monitored, onWatch } = parseRiverBasinTable(cheerio.load(html));

  assert.equal(monitored, 3);
  assert.deepEqual(onWatch, []);
});

test("parseRiverBasinTable keeps each basin's own bulletin link", () => {
  const { onWatch } = parseRiverBasinTable(cheerio.load(floodPage(basinRow("Pampanga", true))));
  assert.equal(
    onWatch[0].bulletinUrl,
    "https://pubfiles.pagasa.dost.gov.ph/pagasaweb/files/hmd/riverbasin/pampanga.pdf",
  );
});

test("parseRiverBasinTable handles sub-basin names with spaces", () => {
  const html = floodPage(basinRow("Angat Sub-basin", true) + basinRow("Magat Sub-basin", false));
  const { monitored, onWatch } = parseRiverBasinTable(cheerio.load(html));
  assert.equal(monitored, 2);
  assert.deepEqual(onWatch.map((basin) => basin.name), ["Angat Sub-basin"]);
});

test("parseRiverBasinTable reports zero monitored when the table is missing", () => {
  // Distinguishable from "all clear" so the caller can log a scraper failure.
  const { monitored, onWatch } = parseRiverBasinTable(cheerio.load(PERMANENT_EXPLAINER));
  assert.equal(monitored, 0);
  assert.deepEqual(onWatch, []);
});

test("parseRiverBasinTable skips rows whose status cell has no known class", () => {
  const html = floodPage(
    basinRow("Pampanga", true) +
      "<tr><td>Mystery</td><td class='text-center'><span>Unknown</span></td></tr>",
  );
  const { monitored, onWatch } = parseRiverBasinTable(cheerio.load(html));
  assert.equal(monitored, 1);
  assert.deepEqual(onWatch.map((basin) => basin.name), ["Pampanga"]);
});
