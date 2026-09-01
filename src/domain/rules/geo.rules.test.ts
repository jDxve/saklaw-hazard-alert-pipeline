import assert from "node:assert/strict";
import { test } from "node:test";
import { HazardEvent } from "../entities/hazard-event";
import { distanceKm, relevanceTo } from "./geo.rules";

const LEGAZPI = { lat: 13.1391, lon: 123.7438 };
const MANILA = { lat: 14.5995, lon: 120.9842 };

function event(overrides: Partial<HazardEvent> = {}): HazardEvent {
  return {
    id: "e1",
    type: "flood",
    severity: "advisory",
    sourceType: "official",
    title: "t",
    plainSummary: "s",
    issuedAt: "2026-09-01T00:00:00.000Z",
    validUntil: null,
    location: null,
    affectedAreas: [],
    source: "DOST-PAGASA",
    raw: { checkedAt: "2026-09-01T00:00:00.000Z", basinsOnWatch: [], basinsMonitored: 0, bulletinUrls: [] },
    ...overrides,
  };
}

test("distanceKm measures the great circle", () => {
  // Legazpi to Manila is roughly 330 km.
  assert.ok(Math.abs(distanceKm(LEGAZPI, MANILA) - 330) < 20);
  assert.equal(distanceKm(LEGAZPI, LEGAZPI), 0);
});

test("an event with its own point matches within the radius", () => {
  const quake = event({ type: "quake", location: LEGAZPI });

  const near = relevanceTo(quake, LEGAZPI, 50);
  assert.equal(near?.type, "point");
  // A PHIVOLCS epicentre is the agency's own coordinate, not our guess.
  assert.equal(near?.accuracy, "authoritative");
  assert.equal(relevanceTo(quake, MANILA, 50), null);
  assert.equal(relevanceTo(quake, MANILA, 400)?.type, "point");
});

test("an approximate basin circle matches, and says that it is approximate", () => {
  const flood = event({
    affectedAreas: [
      {
        area: "Bicol",
        signalLevel: null,
        islandGroup: null,
        approximateCenter: { lat: 13.4, lon: 123.4 },
        approximateRadiusKm: 55,
      },
    ],
  });

  const relevance = relevanceTo(flood, LEGAZPI, 10);
  assert.equal(relevance?.type, "area");
  // Every basin circle is hand-placed; the API must never call one
  // authoritative, or the app will present it as a real flood boundary.
  assert.equal(relevance?.accuracy, "approximate");
  assert.equal(relevanceTo(flood, MANILA, 10), null);
});

test("a hazard the source placed nowhere is returned, not silently dropped", () => {
  // A TCWS over "the rest of Camarines Norte" has no coordinates anywhere in
  // the bulletin. Excluding it from a location query would hide a live warning.
  const cyclone = event({
    type: "cyclone",
    affectedAreas: [
      {
        area: "the rest of Camarines Norte",
        signalLevel: 2,
        islandGroup: "Luzon",
        approximateCenter: null,
        approximateRadiusKm: null,
      },
    ],
  });

  const relevance = relevanceTo(cyclone, MANILA, 10);
  assert.equal(relevance?.type, "unscoped");
  assert.equal(relevance?.accuracy, null);
  assert.equal(relevance?.distanceKm, null);
});
