# Saklaw Hazard Alert Pipeline

The backend for **Saklaw**, an app that tells you if there's a hazard near you
in the Philippines — earthquakes, typhoons, floods.

It checks government websites on a schedule, saves what it finds to Firestore,
and pushes a notification when something actually matters. It also serves the
app a read-only HTTP API over what it has collected. No UI.

## What it watches

| Source | Looking for | How often |
|---|---|---|
| PHIVOLCS | Earthquakes | every 2 min |
| PAGASA | Typhoons + wind signals | every 5 min |
| PAGASA | River basins on flood watch | every 5 min |
| Project NOAH (via Hugging Face) | New hazard map tiles | daily + webhook |

Quakes get checked hardest because they arrive without warning. PAGASA serves
its pages with `cache-control: max-age=60` behind a CDN, so five minutes is
already five times more polite than the freshness they advertise — and it keeps
the blind spot short, which matters most for floods.

PHIVOLCS sends an ETag, so unchanged polls come back as an empty 304 instead of
re-downloading a 3.8 MB page. PAGASA sends no validator, so those always fetch
in full.

## The read API

`hazardsApi`, region `asia-southeast1`. Read-only — it shares the Firestore
repository with the writers but only ever calls its query methods.

```
GET /api/v1/hazards?lat=&lon=&radiusKm=&type=&since=&limit=&activeOnly=
GET /api/v1/hazards/{id}
GET /api/v1/layers/manifest
```

`lat` and `lon` must arrive together; half a point would silently widen a
location query into a nationwide one. Types are the `HazardType` union, comma
joined. `activeOnly` defaults to true.

**What "active" means.** A cyclone bulletin carries PAGASA's own
`valid for broadcast until ...`, and that is what expires it — the response
says `lifecycleBasis: "source"`. Nothing else publishes an expiry, so those age
out on a per-type rule in `domain/rules/hazard-lifecycle.rules.ts` and report
`lifecycleBasis: "pipeline"`. The distinction is in the payload because the app
must not present our guess as the agency's word.

**What `locationMatch` means.** `point` is a real coordinate inside the radius.
`approximateArea` is one of the interim basin circles in
`config/basin-geography.ts` — our approximation, not a PAGASA boundary.
`unscoped` means the source named places only in prose, as TCWS areas always
are, so the hazard could not be ruled out and is returned rather than hidden.

## Running it

```bash
npm install
npm test        # 137 tests, all offline
npm run build
```

Also `npm run lint` and `npm run typecheck`. `tool/preflight.sh` runs all four
in the order CI runs them, which is the thing to run before handing work over.

Locally, against the emulators:

```bash
npm i -g firebase-tools
firebase login
firebase use --add                              # writes .firebaserc
firebase emulators:start --only functions,firestore
```

## Deploying

CI (`.github/workflows/ci.yml`) runs lint, typecheck, test and build on every
push and PR to `main`. It does not deploy.

Deploying is a separate, manually triggered workflow — Actions → Deploy → Run
workflow — because a deploy starts scrapers polling PAGASA and PHIVOLCS every
two to five minutes and puts a live FCM publisher in front of four real topics.
That should follow from someone deciding to ship, not from a merge. It re-runs
every CI gate first, then deploys functions, Firestore rules and indexes, or
both.

It needs three things set once, on a repository environment named
`production` (Settings → Environments), which is also where required reviewers
go if deploys should need an approval:

| Kind | Name | Value |
|---|---|---|
| Variable | `FIREBASE_PROJECT_ID` | the Firebase project id |
| Secret | `FIREBASE_SERVICE_ACCOUNT` | service-account JSON key — roles below |
| Secret | `NOAH_WEBHOOK_SECRET` | any strong random string, used to seed Secret Manager on the first deploy |

The service account needs **Firebase Admin**, **Cloud Functions Developer**,
**Service Account User**, and **Secret Manager Admin**. The last one is not
optional: `NOAH_WEBHOOK_SECRET` is declared with `defineSecret`, which makes it
a *deploy-time* requirement — firebase refuses to deploy a function that
references a secret Secret Manager does not have, and `--non-interactive`
cannot stop to ask. The workflow therefore seeds it from the GitHub secret when
the project has none, and leaves any existing value alone: rotating a secret is
a deliberate act, not a side effect of deploying.

Every one of these fails the run with a named error rather than a stack trace
when it is missing.

Deploying needs the project on the **Blaze** plan. Functions v2, Cloud
Scheduler and outbound calls to PAGASA and PHIVOLCS all require it — on Spark
the scrapers cannot reach the internet at all.

## How it works

Every source does the same five things, and they run independently — if PAGASA
is down, quakes still work:

```
fetch → skip if seen → rate severity → save → maybe notify
```

Events get a predictable ID and are written with Firestore's `create`, which
fails if that ID exists. One atomic step instead of check-then-write, so two
runs at once can't both think they're first and double-notify.

The IDs carry more than you'd expect on purpose. Quakes include position and
magnitude, because PHIVOLCS timestamps only go down to the minute and two quakes
in the same minute would collide. Typhoons include the wind signal so a storm
jumping from Signal 2 to 5 within an hour counts as new — that's the alert you
least want swallowed as a duplicate.

Severity is decided in `domain/rules/`, not read off the page. Notifications
only fire for M5.0+ quakes that happened in the last hour, so a redeploy never
alerts anyone about an earthquake that's already over.

## Not wired up yet

**Volcanoes.** The app's notification settings offer them, but nothing here
produces them. The data is all there whenever you want it:

- `wovodat.phivolcs.dost.gov.ph/bulletin/list-of-bulletin` has every alert level
  in one 9 KB page — `Taal - 1  Kanlaon - 2  Bulusan - 1  Pinatubo - 0  Mayon - 2`
  — inside `<span class="mvo-scroll-level">`, one stable class per volcano.
- Each volcano has a dated bulletin with an English version
  (`/bulletin/activity-mvo?bid=NNNNN&lang=en`) carrying the unrest descriptor,
  the hazards list, and the danger zone. **Parse the radius, don't hardcode it**
  — Mayon says 6 km, Kanlaon says 4 km, same sentence either way.
- Coordinates are static, so just bake them in:
  Taal `14.01011, 120.99780` · Kanlaon `10.41127, 123.13229` ·
  Bulusan `12.76853, 124.05445` · Pinatubo `15.14162, 120.35084` ·
  Mayon `13.25519, 123.68615`

Alert levels barely move, so notify on a *change* in level rather than on every
poll — same trick as the cyclone IDs, put the level in the event ID.

**Flood severity.** Still flat `advisory`. PAGASA's four classes live only
inside the per-basin PDFs, and those are not safely parseable: `pampanga.pdf`
is 950 KB over two pages with 378 text-showing operators and *zero* extractable
plaintext — subset fonts with custom encodings, so it needs a real PDF library
with ToUnicode handling. Until that is funded, grading beyond `advisory` would
be inventing a severity the source never gave us.

**Basin geometry is ours, not PAGASA's.** `config/basin-geography.ts` holds
hand-placed centres and generous radii for the 22 basins. They exist so the API
can answer "might this reach my pin?" instead of returning every national flood
event to everyone. They are not hazard boundaries and are never presented as
such — every basin match returns
`locationMatch: { type: "area", accuracy: "approximate" }`.

Real polygons were investigated and rejected — the reasoning, the source
comparison and the city-by-city test are in
[`docs/basin-geometry-investigation.md`](docs/basin-geometry-investigation.md).
The short version: the official boundaries are behind a Geoportal login,
HydroBASINS has no names, and the open named catchment set excludes river
mouths and deltas, which would silence flood alerts for Aparri, Cotabato City,
Davao City, San Fernando and Malolos. Getting this right needs the DENR-RBCO
boundaries or PAGASA's own FFWS service areas.

## Notes to future me

**Firestore is closed to clients.** `firestore.rules` denies everything. The
app never touches Firestore — it reads over HTTPS from `hazardsApi`, which uses
the Admin SDK and bypasses rules, as the ingestion functions do. Denying by
default is what makes the read API the only door. `firestore.indexes.json`
carries the composite index `findRecent` needs (`type` + `issuedAt desc`).

**PHIVOLCS and PAGASA have no APIs.** That's why this scrapes HTML. If you ever
find a real API, delete half this repo happily.

**PHIVOLCS's TLS chain is incomplete.** Their servers send only the leaf
certificate, no intermediate. Browsers and macOS `curl` quietly fetch the
missing one; Node does not, so it fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`
and Cloud Functions could never reach the site at all. The missing GlobalSign
intermediate is bundled in `infrastructure/http/phivolcs-ca.ts` and handed to
the HTTPS agent. Verification stays fully on — we just supply the link they left
out. A test goes red 90 days before that certificate expires.

**Don't search the whole page for words.** Every scraper here broke this way at
some point, and not one of them threw an error:

- The flood page has a permanent paragraph explaining what "Flood Warning"
  means. Searching for that phrase reported a flood every hour, forever.
- The cyclone scraper pointed at `/weather`, which has no bulletin on it, so it
  could never detect a typhoon.
- `25 August 2026 - 02:15 PM` makes `new Date()` return `Invalid Date` because
  of the ` - `. Every quake got dropped, silently.

Match on structure — a CSS class, a specific panel — and scope it to the part of
the page holding the data.

**"Couldn't read the page" is not "nothing is happening."** An app that reports
all-clear because its scraper broke is failing the one way it really must not.
Parsers here return three answers, not two.

**`PH_BOUNDS` is wider than the country** — past Batanes, out over the Philippine
Trench — because offshore quakes still matter to people onshore. It stops at 4°N
so the Indonesian quakes PHIVOLCS lists for reference stay out.

**`npm test` runs through a script.** It can't be a plain glob: npm uses `sh`,
which doesn't do `**`, so the pattern matched nothing and the suite passed
without running anything.

## Built with

TypeScript on Node 20, Firebase Functions v2, Firestore + FCM, Cheerio for
scraping, Zod for the webhook, `tsx --test` for tests.
