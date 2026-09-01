import assert from "node:assert/strict";
import { test } from "node:test";
import { GisManifest, GisManifestRepository } from "../../domain/ports/gis-manifest.repository";
import { Logger } from "../../domain/ports/logger";
import { Notifier, PushNotification } from "../../domain/ports/notifier";
import { RecordGisDatasetRevisionUseCase } from "./record-gis-dataset-revision.use-case";

class InMemoryManifestRepository implements GisManifestRepository {
  async findCurrent() {
    return null;
  }

  saved: GisManifest | null = null;
  constructor(private currentSha: string | null = null) {}
  async saveIfCommitChanged(manifest: GisManifest): Promise<boolean> {
    if (this.currentSha === manifest.commitSha) return false;
    this.currentSha = manifest.commitSha;
    this.saved = manifest;
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
const LAYERS = ["flood_5yr", "landslide"] as const;

function buildUseCase(repo: GisManifestRepository, notifier: Notifier) {
  return new RecordGisDatasetRevisionUseCase(
    repo,
    notifier,
    silentLogger,
    "https://example.test/tiles.pmtiles",
    LAYERS,
    () => new Date("2026-08-25T06:00:00Z"),
  );
}

test("records a new revision and broadcasts an OTA update", async () => {
  const repo = new InMemoryManifestRepository("old-sha");
  const notifier = new RecordingNotifier();

  const outcome = await buildUseCase(repo, notifier).execute("new-sha", "2026-08-25T05:00:00Z");

  assert.equal(outcome, "updated");
  assert.equal(repo.saved?.commitSha, "new-sha");
  assert.deepEqual(repo.saved?.layers, LAYERS);
  assert.equal(notifier.sent.length, 1);
  assert.equal(notifier.sent[0].data.type, "OTA_GIS_UPDATE");
});

test("skips and stays silent when the revision is already current", async () => {
  const repo = new InMemoryManifestRepository("same-sha");
  const notifier = new RecordingNotifier();

  const outcome = await buildUseCase(repo, notifier).execute("same-sha", "2026-08-25T05:00:00Z");

  assert.equal(outcome, "skipped");
  assert.equal(repo.saved, null);
  assert.equal(notifier.sent.length, 0);
});

test("a second observer of the same commit does not double-broadcast", async () => {
  // The daily poll and the webhook can both see one new commit.
  const repo = new InMemoryManifestRepository("old-sha");
  const notifier = new RecordingNotifier();
  const useCase = buildUseCase(repo, notifier);

  await useCase.execute("new-sha", "2026-08-25T05:00:00Z");
  const second = await useCase.execute("new-sha", "2026-08-25T05:00:00Z");

  assert.equal(second, "skipped");
  assert.equal(notifier.sent.length, 1);
});
