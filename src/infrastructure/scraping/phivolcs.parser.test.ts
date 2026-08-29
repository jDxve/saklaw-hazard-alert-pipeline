import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { normalizeScrapedText, parsePhivolcsDate, parseQuakeRow } from "./phivolcs.parser";

test("parsePhivolcsDate converts a PHIVOLCS local timestamp to ISO", () => {
  const iso = parsePhivolcsDate("25 August 2026 - 02:15 PM");
  assert.ok(iso !== null);
  assert.equal(new Date(iso as string).getUTCHours(), 6); // 02:15 PM +08:00 -> 06:15 UTC
});

test("parsePhivolcsDate returns null for garbage input", () => {
  assert.equal(parsePhivolcsDate("not a date"), null);
});

test("parsePhivolcsDate resolves the full instant, not just the hour", () => {
  assert.equal(parsePhivolcsDate("25 August 2026 - 02:15 PM"), "2026-08-25T06:15:00.000Z");
});

test("parsePhivolcsDate handles midnight and noon meridiems", () => {
  assert.equal(parsePhivolcsDate("25 August 2026 - 12:00 AM"), "2026-08-24T16:00:00.000Z");
  assert.equal(parsePhivolcsDate("25 August 2026 - 12:00 PM"), "2026-08-25T04:00:00.000Z");
});

test("parsePhivolcsDate rolls the date back across the UTC boundary", () => {
  // 01 January 2026, 07:00 PHT is still 31 December 2025 in UTC.
  assert.equal(parsePhivolcsDate("01 January 2026 - 07:00 AM"), "2025-12-31T23:00:00.000Z");
});

test("parsePhivolcsDate tolerates scraped whitespace and separators", () => {
  const expected = "2026-08-25T06:15:00.000Z";
  assert.equal(parsePhivolcsDate("  25   August  2026  -  02:15  PM \n"), expected);
  assert.equal(parsePhivolcsDate("25 August 2026 02:15 PM"), expected);
  assert.equal(parsePhivolcsDate("25 Aug 2026 - 02:15 PM"), expected);
});

test("parsePhivolcsDate accepts an optional seconds field", () => {
  assert.equal(parsePhivolcsDate("25 August 2026 - 02:15:30 PM"), "2026-08-25T06:15:30.000Z");
});

test("parsePhivolcsDate reads a 24-hour timestamp when no meridiem is given", () => {
  assert.equal(parsePhivolcsDate("25 August 2026 - 14:15"), "2026-08-25T06:15:00.000Z");
});

test("parsePhivolcsDate rejects impossible calendar dates instead of rolling them over", () => {
  assert.equal(parsePhivolcsDate("31 February 2026 - 02:15 PM"), null);
  assert.equal(parsePhivolcsDate("32 August 2026 - 02:15 PM"), null);
});

test("parsePhivolcsDate rejects out-of-range clock components", () => {
  assert.equal(parsePhivolcsDate("25 August 2026 - 13:15 PM"), null);
  assert.equal(parsePhivolcsDate("25 August 2026 - 02:75 PM"), null);
  assert.equal(parsePhivolcsDate("25 August 2026 - 25:15"), null);
});

test("parsePhivolcsDate rejects an unknown month name", () => {
  assert.equal(parsePhivolcsDate("25 Smarch 2026 - 02:15 PM"), null);
});

test("parsePhivolcsDate does not salvage a timestamp from a timezone suffix", () => {
  // The previous implementation read the "0800" here as the year 0800.
  assert.equal(parsePhivolcsDate("not a date GMT+0800"), null);
});

test("parsePhivolcsDate parses a timestamp separated by non-breaking spaces", () => {
  // Cheerio decodes &nbsp; to U+00A0; the date must still parse through it.
  assert.equal(
    parsePhivolcsDate("25\u00a0August\u00a02026\u00a0-\u00a002:15\u00a0PM"),
    "2026-08-25T06:15:00.000Z",
  );
});

test("normalizeScrapedText collapses non-breaking spaces and line breaks", () => {
  assert.equal(normalizeScrapedText("  25\u00a0August\n\n2026  "), "25 August 2026");
});

function rowHtml(cells: string[]): string {
  const tds = cells.map((c) => `<td>${c}</td>`).join("");
  return `<table><tr>${tds}</tr></table>`;
}

test("parseQuakeRow extracts a valid in-bounds quake row", () => {
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "13.5", "121.0", "10", "5.4", "Batangas"]),
  );
  const row = $("tr")[0];
  const parsed = parseQuakeRow($, row);
  assert.deepEqual(parsed, {
    dateRaw: "25 August 2026 - 02:15 PM",
    lat: 13.5,
    lon: 121.0,
    depthKm: 10,
    magnitude: 5.4,
    location: "Batangas",
  });
});

test("parseQuakeRow rejects rows outside Philippine bounds", () => {
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "50.0", "121.0", "10", "5.4", "Somewhere else"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0]), null);
});

test("parseQuakeRow rejects rows with too few columns", () => {
  const $ = cheerio.load(rowHtml(["only", "three", "cols"]));
  assert.equal(parseQuakeRow($, $("tr")[0]), null);
});

test("parseQuakeRow rejects a header row whose cells are not numeric", () => {
  const $ = cheerio.load(
    rowHtml(["Date - Time", "Latitude", "Longitude", "Depth", "Magnitude", "Location"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0]), null);
});

// Coordinates below are real rows from the live PHIVOLCS catalogue. They guard
// the two edges that matter: the Philippines reaches further north and east
// than a naive bounding box suggests, and PHIVOLCS also lists distant
// Indonesian events that must not reach Filipino users as national alerts.

test("parseQuakeRow keeps earthquakes north of Batanes", () => {
  // 92 km N of Itbayat — Philippine waters, and the only quakes the country's
  // northernmost province feels. A latMax of 21.5 dropped these silently.
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "21.58", "122.10", "20", "4.5", "Itbayat (Batanes)"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0])?.lat, 21.58);
});

test("parseQuakeRow keeps Philippine Trench quakes off the eastern seaboard", () => {
  // 112 km E of Baganga, Davao Oriental — tsunami-relevant to eastern Mindanao.
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "7.88", "127.53", "35", "2.7", "Baganga (Davao Oriental)"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0])?.lon, 127.53);
});

test("parseQuakeRow rejects distant Indonesian quakes PHIVOLCS lists for reference", () => {
  // Described as "408 km S of Balut Island", but at 2.16 N it is the Molucca
  // Sea. Admitting it would push an M5.3 national alert for a foreign event.
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "2.16", "127.16", "50", "5.3", "Balut Island (Davao Occidental)"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0]), null);
});

test("parseQuakeRow rejects coordinates that could only come from a parse error", () => {
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "48.9", "2.35", "10", "5.4", "Somewhere in Europe"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0]), null);
});

test("parseQuakeRow rejects an out-of-range magnitude", () => {
  const $ = cheerio.load(
    rowHtml(["25 August 2026 - 02:15 PM", "13.5", "121.0", "10", "42.0", "Batangas"]),
  );
  assert.equal(parseQuakeRow($, $("tr")[0]), null);
});

test("parseQuakeRow normalizes whitespace inside scraped cells", () => {
  const $ = cheerio.load(
    rowHtml(["25 August 2026 -\u00a0 02:15 PM", "13.5", "121.0", "10", "5.4", " Batangas\n"]),
  );
  const parsed = parseQuakeRow($, $("tr")[0]);
  assert.equal(parsed?.dateRaw, "25 August 2026 - 02:15 PM");
  assert.equal(parsed?.location, "Batangas");
  assert.ok(parsePhivolcsDate(parsed!.dateRaw) !== null);
});
