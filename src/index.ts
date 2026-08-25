import { setGlobalOptions } from "firebase-functions/v2";
import {
  COLLECTION,
  MAX_RETRY_ATTEMPTS,
  NOAH_DATASET_API_URL,
  NOAH_LAYERS,
  PMTILES_URL,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
} from "./config/constants";
import { IngestPagasaCycloneUseCase } from "./application/use-cases/ingest-pagasa-cyclone.use-case";
import { IngestPagasaFloodUseCase } from "./application/use-cases/ingest-pagasa-flood.use-case";
import { IngestPhivolcsQuakesUseCase } from "./application/use-cases/ingest-phivolcs-quakes.use-case";
import { RecordGisDatasetRevisionUseCase } from "./application/use-cases/record-gis-dataset-revision.use-case";
import { SyncNoahDatasetUseCase } from "./application/use-cases/sync-noah-dataset.use-case";
import { FcmNotifier } from "./infrastructure/firebase/fcm-notifier";
import { initializeFirebaseApp } from "./infrastructure/firebase/firebase-app";
import { FirestoreGisManifestRepository } from "./infrastructure/firebase/firestore-gis-manifest.repository";
import { FirestoreHazardEventRepository } from "./infrastructure/firebase/firestore-hazard-event.repository";
import { AxiosHttpClient } from "./infrastructure/http/http-client";
import { ConsoleLogger } from "./infrastructure/logging/console-logger";
import { HuggingFaceNoahDatasetSource } from "./infrastructure/scraping/noah.client";
import { PagasaFloodSource, PagasaWeatherSource } from "./infrastructure/scraping/pagasa.client";
import { PhivolcsQuakeSource } from "./infrastructure/scraping/phivolcs.client";
import { registerNoahDailySync } from "./presentation/functions/noah-daily-sync.function";
import { registerNoahWebhook } from "./presentation/functions/noah-webhook.function";
import { registerScheduledCycloneSync } from "./presentation/functions/scheduled-cyclone-sync.function";
import { registerScheduledFloodSync } from "./presentation/functions/scheduled-flood-sync.function";
import { registerScheduledQuakeSync } from "./presentation/functions/scheduled-quake-sync.function";

setGlobalOptions({ region: "asia-southeast1", maxInstances: 1 });

// --- Composition root: wire infrastructure adapters into application use cases. ---

const { db, messaging } = initializeFirebaseApp();

const phivolcsLogger = new ConsoleLogger("PHIVOLCS");
const pagasaLogger = new ConsoleLogger("PAGASA");
const noahLogger = new ConsoleLogger("NOAH");
const schedulerLogger = new ConsoleLogger("SCHEDULER");

const httpClient = new AxiosHttpClient(REQUEST_TIMEOUT_MS, USER_AGENT, MAX_RETRY_ATTEMPTS, schedulerLogger);
const hazardEventRepository = new FirestoreHazardEventRepository(db, COLLECTION);
const gisManifestRepository = new FirestoreGisManifestRepository(db);
const notifier = new FcmNotifier(messaging, schedulerLogger);

const quakeUseCase = new IngestPhivolcsQuakesUseCase(
  new PhivolcsQuakeSource(httpClient, phivolcsLogger),
  hazardEventRepository,
  notifier,
  phivolcsLogger,
);

const cycloneUseCase = new IngestPagasaCycloneUseCase(
  new PagasaWeatherSource(httpClient, pagasaLogger),
  hazardEventRepository,
  notifier,
  pagasaLogger,
);

const floodUseCase = new IngestPagasaFloodUseCase(
  new PagasaFloodSource(httpClient, pagasaLogger),
  hazardEventRepository,
  notifier,
  pagasaLogger,
);

const recordRevisionUseCase = new RecordGisDatasetRevisionUseCase(
  gisManifestRepository,
  notifier,
  noahLogger,
  PMTILES_URL,
  NOAH_LAYERS,
);

const syncNoahDatasetUseCase = new SyncNoahDatasetUseCase(
  new HuggingFaceNoahDatasetSource(httpClient, NOAH_DATASET_API_URL),
  recordRevisionUseCase,
  noahLogger,
);

// --- Firebase Functions entrypoints ---

export const syncPhivolcsQuakes = registerScheduledQuakeSync({
  quakeUseCase,
  logger: schedulerLogger,
});

export const syncPagasaCyclone = registerScheduledCycloneSync({
  cycloneUseCase,
  logger: schedulerLogger,
});

export const syncPagasaFlood = registerScheduledFloodSync({
  floodUseCase,
  logger: schedulerLogger,
});

export const noahHuggingFaceWebhook = registerNoahWebhook({
  recordRevisionUseCase,
  logger: noahLogger,
});

export const syncNoahGisDataset = registerNoahDailySync({
  syncUseCase: syncNoahDatasetUseCase,
  logger: noahLogger,
});
