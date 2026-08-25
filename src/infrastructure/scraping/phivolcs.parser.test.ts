import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { parsePhivolcsDate, parseQuakeRow } from "./phivolcs.parser";

test("parsePhivolcsDate converts a PHIVOLCS local timestamp to ISO", () => {
  const iso = parsePhivolcsDate("25 August 2026 - 02:15 PM");
  assert.ok(iso !== null);
  assert.equal(new Date(iso as string).getUTCHours(), 6); // 02:15 PM +08:00 -> 06:15 UTC
});

test("parsePhivolcsDate returns null for garbage input", () => {
  assert.equal(parsePhivolcsDate("not a date"), null);
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
