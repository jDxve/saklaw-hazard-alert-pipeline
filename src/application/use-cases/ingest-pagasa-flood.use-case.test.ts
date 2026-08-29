import assert from "node:assert/strict";
import { test } from "node:test";
import { FloodDetails, HazardEvent } from "../../domain/entities/hazard-event";
import { FloodBulletin, FloodSource } from "../../domain/ports/flood-source";
import { HazardEventRepository } from "../../domain/ports/hazard-event.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier, PushNotification } from "../../domain/ports/notifier";
import { IngestPagasaFloodUseCase } from "./ingest-pagasa-flood.use-case";

class FakeFloodSource implements FloodSource {
  constructor(private readonly bulletin: FloodBulletin | null) {}
  async fetchActiveFloodBulletin(): Promise<FloodBulletin | null> {
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

function bulletin(names: string[]): FloodBulletin {
  return {
    basinsOnWatch: names.map((name) => ({ name, bulletinUrl: null })),
    basinsMonitored: 22,
  };
}

function buildUseCase(
  value: FloodBulletin | null,
  repo: HazardEventRepository,
  notifier: Notifier,
  now: () => Date,
) {
  return new IngestPagasaFloodUseCase(
    new FakeFloodSource(value),
    repo,
    notifier,
    silentLogger,
    now,
  );
}

const AT_0605 = () => new Date("2026-08-25T06:05:00Z");
const AT_0655 = () => new Date("2026-08-25T06:55:00Z");

test("stays silent when no basin is on flood watch", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(null, repo, notifier, AT_0605).execute();

  assert.equal(repo.saved.length, 0);
  assert.equal(notifier.sent.length, 0);
});

test("saves and notifies, naming the basins on watch", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(bulletin(["Pampanga", "Agno"]), repo, notifier, AT_0605).execute();

  assert.equal(repo.saved.length, 1);
  const event = repo.saved[0];
  assert.equal(event.title, "PAGASA: Flood Watch — Pampanga and Agno");
  assert.equal(event.plainSummary, "2 of 22 monitored river basins are under flood watch.");
  assert.deepEqual((event.raw as FloodDetails).basinsOnWatch, ["Pampanga", "Agno"]);
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].topic, "flood_ph_alerts");
});

test("abbreviates a long basin list in the title", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(
    bulletin(["Pampanga", "Agno", "Abra", "Angat Sub-basin"]),
    repo,
    notifier,
    AT_0605,
  ).execute();

  assert.equal(repo.saved[0].title, "PAGASA: Flood Watch — Pampanga, Agno and 2 more");
});

test("does not repeat while the same basins stay on watch", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(bulletin(["Pampanga"]), repo, notifier, AT_0605).execute();
  await buildUseCase(bulletin(["Pampanga"]), repo, notifier, AT_0655).execute();

  assert.equal(repo.saved.length, 1);
  assert.equal(notifier.sent.length, 1);
});

test("alerts again when the flood spreads to another basin in the same hour", async () => {
  const repo = new InMemoryHazardEventRepository();
  const notifier = new RecordingNotifier();

  await buildUseCase(bulletin(["Pampanga"]), repo, notifier, AT_0605).execute();
  await buildUseCase(bulletin(["Pampanga", "Bicol"]), repo, notifier, AT_0655).execute();

  assert.equal(repo.saved.length, 2);
  assert.equal(notifier.sent.length, 2);
  assert.equal(notifier.sent[1].data.basinsOnWatch, "Pampanga,Bicol");
});
