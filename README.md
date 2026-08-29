# Saklaw Hazard Alert Pipeline

The backend for **Saklaw**, an app that tells you if there's a hazard near you
in the Philippines — earthquakes, typhoons, floods.

It checks government websites on a schedule, saves what it finds to Firestore,
and pushes a notification when something actually matters. No UI, no API. Just
the thing quietly running in the background.

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

## Running it

```bash
npm install
npm test        # 106 tests, all offline
npm run build
```

Also `npm run lint` and `npm run typecheck`.

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

**Firestore rules.** There's no `firestore.rules` or `firestore.indexes.json` in
here, so whether the app can read `hazard_events` depends on a console setting
nobody has written down. Worth fixing before the app tries to read anything.

## Notes to future me

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
