import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RADIUS_KM, parseHazardQuery } from "./hazard-request";

const NOW = new Date("2026-09-01T06:00:00.000Z");

test("defaults to active hazards in the last day, nationwide", () => {
  const parsed = parseHazardQuery({}, NOW);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.request.at, null);
  assert.equal(parsed.request.activeOnly, true);
  assert.equal(parsed.request.radiusKm, DEFAULT_RADIUS_KM);
  assert.equal(parsed.request.since, "2026-08-31T06:00:00.000Z");
});

test("a half-given point is refused rather than widened to the whole country", () => {
  // Silently dropping a lone `lat` would turn a location query into a national
  // one, and the app would show hazards nowhere near the reader as nearby.
  const parsed = parseHazardQuery({ lat: "13.1" }, NOW);
  assert.equal(parsed.ok, false);
});

test("hazard types are validated against the union", () => {
  const good = parseHazardQuery({ type: "cyclone,flood" }, NOW);
  assert.equal(good.ok, true);
  if (good.ok) assert.deepEqual(good.request.types, ["cyclone", "flood"]);

  const bad = parseHazardQuery({ type: "tsunami" }, NOW);
  assert.equal(bad.ok, false);
});

test("an over-long history is clamped to the window, not rejected", () => {
  const parsed = parseHazardQuery({ since: "2020-01-01T00:00:00Z" }, NOW);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.request.since, "2026-08-01T06:00:00.000Z");
});

test("nonsense input is refused", () => {
  assert.equal(parseHazardQuery({ lat: "13.1", lon: "999" }, NOW).ok, false);
  assert.equal(parseHazardQuery({ since: "yesterday" }, NOW).ok, false);
  assert.equal(parseHazardQuery({ limit: "5000" }, NOW).ok, false);
});

test("activeOnly can be turned off explicitly", () => {
  const parsed = parseHazardQuery({ activeOnly: "false" }, NOW);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.request.activeOnly, false);
});
