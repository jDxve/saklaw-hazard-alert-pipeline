# Saklaw Hazard Alert Pipeline

Backend data pipeline (Firebase Cloud Functions, TypeScript) that feeds the **Saklaw** mobile app with official Philippine hazard information.

## What this is

A scheduled ingestion service that scrapes/polls official Philippine government hazard sources, normalizes each report into a common `HazardEvent` shape, deduplicates it against Firestore, and — when a report crosses a severity threshold — pushes a push notification (FCM) to subscribed app users. It also mirrors a third-party hazard-map dataset (Project NOAH via Hugging Face) so the app can display up-to-date flood/landslide/storm-surge overlay maps.

It has no UI of its own — it is the always-on backend that keeps the Saklaw app's hazard feed and map layers current.

## Purpose

Filipinos need a single, trustworthy, low-latency source of truth for hazards (earthquakes, tropical cyclones, floods) instead of manually checking PHIVOLCS/PAGASA websites. This pipeline:

- **Aggregates** official sources into one consistent event format.
- **Classifies severity** (info / advisory / warning / critical) using fixed domain rules, not raw source text.
- **Deduplicates** so the same earthquake or bulletin isn't re-saved or re-notified on every poll.
- **Notifies** only when a hazard is significant enough to matter (e.g. M5.0+ earthquakes, TCWS-bearing cyclones, red/orange flood alerts).
- **Keeps hazard map layers fresh** by watching for new GIS dataset revisions and notifying the app to fetch updated map tiles.

## Data sources → hazard types

| Source | Type | Fetch method |
|---|---|---|
| DOST-PHIVOLCS (earthquake bulletin) | `quake` | HTML scrape |
| DOST-PAGASA (weather bulletin) | `cyclone` | HTML scrape |
| DOST-PAGASA River Basin Center (flood portal) | `flood` | HTML scrape |
| Project NOAH hazard maps (Hugging Face dataset) | GIS layer revisions (flood/landslide/storm surge/debris flow tiles) | Hugging Face API + webhook |

## Architecture

The codebase follows a **ports & adapters (hexagonal) architecture**:

```
src/
├── domain/            # Pure business logic — no I/O, no framework
│   ├── entities/       HazardEvent and its variant "raw" payloads
│   ├── ports/           Interfaces: *Source, *Repository, Notifier, Logger
│   └── rules/           Severity classification (quake/cyclone/flood)
├── application/
│   └── use-cases/      Orchestration: fetch → dedupe → classify → save → notify
├── infrastructure/     # Concrete adapters implementing the ports
│   ├── scraping/        PHIVOLCS/PAGASA HTML parsers + clients, NOAH HF client
│   ├── firebase/        Firestore repositories, FCM notifier, app init
│   ├── http/             Axios client with timeout + retry
│   └── logging/          Console logger
├── presentation/
│   └── functions/      Firebase Functions entrypoints (schedule/HTTP triggers)
├── config/constants.ts # URLs, thresholds, topics, timeouts
└── index.ts             Composition root — wires adapters into use cases, exports functions
```

This separation means the ingestion/classification logic (`application`, `domain`) has zero dependency on Firebase or Axios, and is unit-testable in isolation (see the `*.test.ts` files next to the parsers and rules).

## Cloud Functions (entrypoints)

Defined in `src/index.ts`, deployed to region `asia-southeast1`:

| Export | Trigger | Purpose |
|---|---|---|
| `syncOfficialPHFeeds` | Schedule — every 1 minute (Asia/Manila) | Runs the PHIVOLCS quake, PAGASA cyclone, and PAGASA flood pipelines concurrently via `Promise.allSettled` |
| `syncNoahGisDataset` | Schedule — daily at 02:00 (Asia/Manila) | Polls the Project NOAH Hugging Face dataset API for a new commit revision |
| `noahHuggingFaceWebhook` | HTTPS POST | Hugging Face webhook (secret-authenticated) that reacts immediately when the NOAH dataset repo gets a new commit, instead of waiting for the daily poll |

## Processing flow (per hazard)

1. **Fetch** — an adapter (e.g. `PhivolcsQuakeSource`) scrapes/calls the source and returns typed observations.
2. **Dedupe check** — a deterministic event ID is derived (e.g. `phivolcs_eq_<timestamp>`, `pagasa_tc_<hour>`) and checked against Firestore (`hazard_events` collection) before doing any work.
3. **Classify severity** — pure functions in `domain/rules/severity.rules.ts`:
   - Quake: `≥6.0` critical, `≥4.5` warning, else info
   - Cyclone: `≥TCWS 3` critical, `≥TCWS 2` warning, else advisory
   - Flood: red alert → critical, orange alert → warning, else advisory
4. **Save** — the normalized `HazardEvent` is written to Firestore.
5. **Notify (conditional)** — an FCM push is sent to a topic (`hazards_ph_critical`, `cyclone_ph_alerts`, `flood_ph_alerts`, `gis_layer_updates`) only when the event meets the notify threshold (e.g. quake magnitude ≥ 5.0; cyclones and floods always notify once saved).

Each hazard pipeline runs independently and failures are isolated — one source failing (e.g. PAGASA site down) doesn't block the others, and a single malformed row within a source is caught and skipped rather than failing the whole batch.

## Tech stack

- **TypeScript** targeting Node.js ≥ 20
- **Firebase Functions v2** (scheduler + HTTPS triggers) and **Firebase Admin** (Firestore + Cloud Messaging)
- **Axios** for HTTP with a built-in timeout/retry wrapper
- **Cheerio** for HTML scraping/parsing of PHIVOLCS/PAGASA pages
- **Zod** for webhook payload validation
- **tsx --test** for the test runner, **ESLint** for linting

## Scripts

```bash
npm run build        # tsc compile to lib/
npm run build:watch  # tsc in watch mode
npm run lint          # eslint .
npm test               # tsx --test src/**/*.test.ts
```
