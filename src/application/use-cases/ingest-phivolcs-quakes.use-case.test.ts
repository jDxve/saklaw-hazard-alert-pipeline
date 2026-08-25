import assert from "node:assert/strict";
import { test } from "node:test";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier, PushNotification } from "../../domain/ports/notifier";
import { QuakeObservation, QuakeSource } from "../../domain/ports/quake-source";
import { IngestPhivolcsQuakesUseCase } from "./ingest-phivolcs-quakes.use-case";

class FakeQuakeSource implements QuakeSource {
  constructor(private readonly observations: QuakeObservation[]) {}
  async fetchRecentQuakes(): Promise<QuakeObservation[]> {
    return this.observations;
  }
}

class InMemoryHazardEventRepository implements HazardEventRepository {
  readonly saved: HazardEvent[] = [];
  constructor(private readonly existingIds: Set<string> = new Set()) {}
  async exists(id: string): Promise<boolean> {
    return this.existingIds.has(id);
  }
  async save(event: HazardEvent): Promise<void> {
    this.saved.push(event);
  }
}

class RecordingNotifier implements Notifier {
  readonly sent: PushNotification[] = [];
  async send(notification: PushNotification): Promise<void> {
    this.sent.push(notification);
  }
}

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

function observation(overrides: Partial<QuakeObservation> = {}): QuakeObservation {
  return {
    occurredAt: "2026-08-25T06:00:00.000Z",
    lat: 13.5,
    lon: 121.0,
    depthKm: 10,
    magnitude: 4.0,
    location: "Batangas",
    ...overrides,
  };
}

test("saves a new quake event and skips notification below threshold", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();
  const useCase = new IngestPhivolcsQuakesUseCase(
    new FakeQuakeSource([observation({ magnitude: 4.0 })]),
    repo,
    notifier,
    silentLogger,
  );

  await useCase.execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 0);
});

test("notifies when magnitude meets the notify threshold", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();
  const useCase = new IngestPhivolcsQuakesUseCase(
    new FakeQuakeSource([observation({ magnitude: 5.5 })]),
    repo,
    notifier,
    silentLogger,
  );

  await useCase.execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].topic, "hazards_ph_critical");
});

test("skips an observation whose event id already exists", async () => {
  const existingId = `phivolcs_eq_${new Date("2026-08-25T06:00:00.000Z").getTime()}`;
  const repo = new InMemoryHazardEventRepository(new Set([existingId]));
  const notifier = new RecordingNotifier();
  const useCase = new IngestPhivolcsQuakesUseCase(
    new FakeQuakeSource([observation()]),
    repo,
    notifier,
    silentLogger,
  );

  await useCase.execute();

  assert.equal(repo.saved.length, 0);
  assert.equal(notifier.sent.length, 0);
});

test("processes observations independently: one failure doesn't block the rest", async () => {
  const repo = new InMemoryHazardEventRepository();
  repo.save = async () => {
    throw new Error("boom");
  };
  const notifier = new RecordingNotifier();
  const useCase = new IngestPhivolcsQuakesUseCase(
    new FakeQuakeSource([observation({ location: "A" }), observation({ location: "B" })]),
    repo,
    notifier,
    silentLogger,
  );

  await assert.doesNotReject(() => useCase.execute());
});
