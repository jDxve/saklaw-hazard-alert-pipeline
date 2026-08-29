import assert from "node:assert/strict";
import { test } from "node:test";
import { HazardEvent } from "../../domain/entities/hazard-event";
import { CycloneBulletin, CycloneSource } from "../../domain/ports/cyclone-source";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier, PushNotification } from "../../domain/ports/notifier";
import { IngestPagasaCycloneUseCase } from "./ingest-pagasa-cyclone.use-case";

class FakeCycloneSource implements CycloneSource {
  constructor(private readonly bulletin: CycloneBulletin | null) {}
  async fetchActiveCyclone(): Promise<CycloneBulletin | null> {
    return this.bulletin;
  }
}

class InMemoryHazardEventRepository implements HazardEventRepository {
  readonly saved: HazardEvent[] = [];
  private readonly ids = new Set<string>();
  async saveIfAbsent(event: HazardEvent): Promise<boolean> {
    if (this.ids.has(event.id)) return false;
    this.ids.add(event.id);
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

function buildUseCase(
  bulletin: CycloneBulletin | null,
  repo: HazardEventRepository,
  notifier: Notifier,
  now: () => Date,
) {
  return new IngestPagasaCycloneUseCase(
    new FakeCycloneSource(bulletin),
    repo,
    notifier,
    silentLogger,
    now,
  );
}

test("does nothing when no cyclone is active", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(null, repo, notifier, () => new Date("2026-08-25T06:05:00Z")).execute();

  assert.equal(repo.saved.length, 0);
  assert.equal(notifier.sent.length, 0);
});

test("saves and notifies an active cyclone bulletin", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(
    { stormName: "TYPHOON PEPITO", maxSignal: 3 },
    repo,
    notifier,
    () => new Date("2026-08-25T06:05:00Z"),
  ).execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(repo.saved[0].severity, "critical");
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].topic, "cyclone_ph_alerts");
});

test("does not repeat the same bulletin within the hour", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();
  const bulletin: CycloneBulletin = { stormName: "TYPHOON PEPITO", maxSignal: 2 };

  await buildUseCase(bulletin, repo, notifier, () => new Date("2026-08-25T06:05:00Z")).execute();
  await buildUseCase(bulletin, repo, notifier, () => new Date("2026-08-25T06:55:00Z")).execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 1);
});

test("alerts on an escalation that happens inside the same hour", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(
    { stormName: "TYPHOON PEPITO", maxSignal: 2 },
    repo,
    notifier,
    () => new Date("2026-08-25T06:05:00Z"),
  ).execute();
  await buildUseCase(
    { stormName: "TYPHOON PEPITO", maxSignal: 5 },
    repo,
    notifier,
    () => new Date("2026-08-25T06:55:00Z"),
  ).execute();

  assert.equal(repo.saved.length, 2);
  assert.equal(notifier.sent.length, 2);
  assert.equal(notifier.sent[1].data.maxSignal, "5");
});
