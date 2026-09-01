import assert from "node:assert/strict";
import { test } from "node:test";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository, HazardQuery } from "../../domain/ports/hazard-event.repository";
import { QueryHazardsUseCase } from "./query-hazards.use-case";

const NOW = new Date("2026-09-01T06:00:00.000Z");
const LEGAZPI = { lat: 13.1391, lon: 123.7438 };

class StubRepository implements HazardEventRepository {
  lastQuery: HazardQuery | null = null;
  constructor(private readonly events: HazardEvent[]) {}
  async saveIfAbsent(): Promise<boolean> {
    return true;
  }
  async findRecent(query: HazardQuery): Promise<HazardEvent[]> {
    this.lastQuery = query;
    return this.events;
  }
  async findById(id: string): Promise<HazardEvent | null> {
    return this.events.find((event) => event.id === id) ?? null;
  }
}

function quake(id: string, at: { lat: number; lon: number }, issuedAt: string): HazardEvent {
  return {
    id,
    type: "quake",
    severity: "warning",
    sourceType: "official",
    title: "quake",
    plainSummary: "s",
    issuedAt,
    validUntil: null,
    location: at,
    affectedAreas: [],
    source: "DOST-PHIVOLCS",
    raw: { lat: at.lat, lon: at.lon, depthKm: 10, magnitude: 5, location: "near" },
  };
}

const request = {
  types: [] as never[],
  at: null,
  radiusKm: 100,
  since: "2026-08-31T06:00:00.000Z",
  limit: 50,
  activeOnly: true,
};

test("lapsed events are dropped when only active ones are asked for", async () => {
  const repo = new StubRepository([
    quake("fresh", LEGAZPI, "2026-09-01T05:00:00.000Z"),
    quake("stale", LEGAZPI, "2026-08-30T00:00:00.000Z"),
  ]);

  const results = await new QueryHazardsUseCase(repo, () => NOW).execute(request);
  assert.deepEqual(results.map((r) => r.event.id), ["fresh"]);
});

test("lapsed events are kept, and marked, when asked for", async () => {
  const repo = new StubRepository([quake("stale", LEGAZPI, "2026-08-30T00:00:00.000Z")]);

  const results = await new QueryHazardsUseCase(repo, () => NOW).execute({
    ...request,
    activeOnly: false,
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].active, false);
});

test("a location narrows the window, and reports how it matched", async () => {
  const repo = new StubRepository([
    quake("near", LEGAZPI, "2026-09-01T05:00:00.000Z"),
    quake("far", { lat: 18.5, lon: 121.0 }, "2026-09-01T05:00:00.000Z"),
  ]);

  const results = await new QueryHazardsUseCase(repo, () => NOW).execute({
    ...request,
    at: LEGAZPI,
    radiusKm: 50,
  });

  assert.deepEqual(results.map((r) => r.event.id), ["near"]);
  assert.equal(results[0].relevance?.type, "point");
});

test("type and window narrowing are pushed down to the repository", async () => {
  const repo = new StubRepository([]);
  await new QueryHazardsUseCase(repo, () => NOW).execute({
    ...request,
    types: ["cyclone"] as never,
  });

  assert.deepEqual(repo.lastQuery?.types, ["cyclone"]);
  assert.equal(repo.lastQuery?.since, request.since);
});
