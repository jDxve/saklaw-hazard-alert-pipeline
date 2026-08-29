import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import {
  detectMaxTcwsSignal,
  extractStormName,
  parseCycloneBulletin,
  parseRiverBasinTable,
} from "./pagasa.parser";

test("detectMaxTcwsSignal finds the highest hoisted signal", () => {
  assert.equal(detectMaxTcwsSignal("TCWS No. 3 is up in some areas, Signal No. 2 elsewhere"), 3);
});

test("detectMaxTcwsSignal defaults to 1 when no signal marker is present", () => {
  assert.equal(detectMaxTcwsSignal("no signals hoisted"), 1);
});

test("detectMaxTcwsSignal takes the maximum regardless of order", () => {
  assert.equal(detectMaxTcwsSignal("Signal No. 2 in Bicol, later raised to TCWS No. 5"), 5);
});

test("detectMaxTcwsSignal tolerates PAGASA's punctuation and spacing variants", () => {
  assert.equal(detectMaxTcwsSignal("TCWS No.4 hoisted"), 4);
  assert.equal(detectMaxTcwsSignal("Wind Signal #3 raised"), 3);
  assert.equal(detectMaxTcwsSignal("tcws  number  2"), 2);
});

test("detectMaxTcwsSignal ignores unrelated numbers", () => {
  assert.equal(detectMaxTcwsSignal("Bulletin No. 12 issued at 5 PM"), 1);
});

test("extractStormName parses typhoon category and name", () => {
  assert.equal(extractStormName("SUPER TYPHOON PEPITO continues to move west"), "SUPER TYPHOON PEPITO");
});

test("extractStormName falls back when no storm name is found", () => {
  assert.equal(extractStormName("no cyclone text here"), "Active Tropical Cyclone");
});

test("extractStormName prefers the full severe tropical storm category", () => {
  assert.equal(
    extractStormName("SEVERE TROPICAL STORM KRISTINE is forecast to intensify"),
    "SEVERE TROPICAL STORM KRISTINE",
  );
});

// --- cyclone bulletin -------------------------------------------------------

/** Mirrors the real page: site nav, then the bulletin panel, then the archive. */
function cyclonePage(bulletinHtml: string, archiveHtml = ""): string {
  return `
    <nav>
      <ul>
        <li><a href="/tropical-cyclone/tropical-cyclone-advisory">Tropical Cyclone Advisory</a></li>
        <li><a href="/tropical-cyclone/severe-weather-bulletin">Tropical Cyclone Bulletin</a></li>
        <li><a href="/tropical-cyclone/forecast-storm-surge">Forecast Storm Surge</a></li>
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

test("parseCycloneBulletin reports calm on the explicit stand-down phrase", () => {
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(STAND_DOWN)));
  assert.deepEqual(reading, { kind: "none" });
});

test("parseCycloneBulletin ignores the site navigation naming cyclone products", () => {
  // The old detector searched the whole body, where the nav alone mentions
  // "Tropical Cyclone" dozens of times on every page, cyclone or not.
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(STAND_DOWN)));
  assert.equal(reading.kind, "none");
});

test("parseCycloneBulletin ignores past storms listed in the archive panel", () => {
  const archive = "<ul><li>TYPHOON OBET TCB#1_obet.pdf</li><li>Signal No. 4</li></ul>";
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(STAND_DOWN, archive)));
  assert.equal(reading.kind, "none");
});

test("parseCycloneBulletin reads an active bulletin", () => {
  const live = `
    <h3>TROPICAL CYCLONE BULLETIN NO. 7</h3>
    <p>SUPER TYPHOON PEPITO maintains its strength.</p>
    <p>TCWS No. 4 is in effect over northern Catanduanes, Signal No. 2 elsewhere.</p>`;
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage(live)));
  assert.deepEqual(reading, {
    kind: "active",
    bulletin: { stormName: "SUPER TYPHOON PEPITO", maxSignal: 4 },
  });
});

test("parseCycloneBulletin reports unreadable when the bulletin panel is gone", () => {
  const reading = parseCycloneBulletin(cheerio.load("<html><body><nav>Tropical Cyclone</nav></body></html>"));
  assert.equal(reading.kind, "unreadable");
});

test("parseCycloneBulletin will not call it calm without evidence either way", () => {
  // Panel present, no stand-down, no bulletin content — we know nothing, and
  // saying "no cyclone" here would be an all-clear we cannot support.
  const reading = parseCycloneBulletin(cheerio.load(cyclonePage("<p>Under maintenance.</p>")));
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
