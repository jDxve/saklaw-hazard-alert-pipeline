import assert from "node:assert/strict";
import { test } from "node:test";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier, PushNotification } from "../../domain/ports/notifier";
import { QuakeObservation, QuakeSource } from "../../domain/ports/quake-source";
import { quakeEventId } from "../../domain/rules/event-id.rules";
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
  async saveIfAbsent(event: HazardEvent): Promise<boolean> {
    if (this.existingIds.has(event.id)) return false;
    this.existingIds.add(event.id);
    this.saved.push(event);
    return true;
  }
}

class RecordingNotifier implements Notifier {
  readonly sent: PushNotification[] = [];
  async send(notification: PushNotification): Promise<void> {
    this.sent.push(notification);
  }
}

const silentLogger: Logger = { info() {}, warn() {}, error() {} };

const OCCURRED_AT = "2026-08-25T06:00:00.000Z";
/** Ten minutes after OCCURRED_AT, so a fresh quake is inside the alert window. */
const NOW = () => new Date("2026-08-25T06:10:00.000Z");

function observation(overrides: Partial<QuakeObservation> = {}): QuakeObservation {
  return {
    occurredAt: OCCURRED_AT,
    lat: 13.5,
    lon: 121.0,
    depthKm: 10,
    magnitude: 4.0,
    location: "Batangas",
    ...overrides,
  };
}

function buildUseCase(
  observations: QuakeObservation[],
  repo: InMemoryHazardEventRepository,
  notifier: RecordingNotifier,
  now: () => Date = NOW,
) {
  return new IngestPhivolcsQuakesUseCase(
    new FakeQuakeSource(observations),
    repo,
    notifier,
    silentLogger,
    now,
  );
}

test("saves a new quake event and skips notification below threshold", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase([observation({ magnitude: 4.0 })], repo, notifier).execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 0);
});

test("notifies when magnitude meets the notify threshold", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase([observation({ magnitude: 5.5 })], repo, notifier).execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].topic, "hazards_ph_critical");
});

test("skips an observation whose event id already exists", async () => {
  const existingId = quakeEventId(observation());
  const repo = new InMemoryHazardEventRepository(new Set([existingId]));
  const notifier = new RecordingNotifier();

  await buildUseCase([observation()], repo, notifier).execute();

  assert.equal(repo.saved.length, 0);
  assert.equal(notifier.sent.length, 0);
});

test("processes observations independently: one failure doesn't block the rest", async () => {
  const repo = new InMemoryHazardEventRepository();
  repo.saveIfAbsent = async () => {
    throw new Error("boom");
  };
  const notifier = new RecordingNotifier();
  const useCase = buildUseCase(
    [observation({ location: "A" }), observation({ location: "B" })],
    repo,
    notifier,
  );

  await assert.doesNotReject(() => useCase.execute());
});

test("keeps two quakes reported in the same minute as separate events", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();
  const useCase = buildUseCase(
    [
      observation({ lat: 13.5, lon: 121.0, magnitude: 4.2, location: "Batangas" }),
      observation({ lat: 9.1, lon: 125.4, magnitude: 3.8, location: "Surigao" }),
    ],
    repo,
    notifier,
  );

  await useCase.execute();

  assert.equal(repo.saved.length, 2);
  assert.notEqual(repo.saved[0].id, repo.saved[1].id);
});

test("saves but does not alert on a quake older than the notify window", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();
  const sixHoursLater = () => new Date("2026-08-25T12:00:00.000Z");

  await buildUseCase([observation({ magnitude: 6.5 })], repo, notifier, sixHoursLater).execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 0);
});

test("classifies severity from magnitude", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(
    [
      observation({ magnitude: 3.0, lat: 13.5 }),
      observation({ magnitude: 4.8, lat: 13.6 }),
      observation({ magnitude: 6.2, lat: 13.7 }),
    ],
    repo,
    notifier,
  ).execute();

  assert.deepEqual(
    repo.saved.map((event) => event.severity).sort(),
    ["critical", "info", "warning"],
  );
});
