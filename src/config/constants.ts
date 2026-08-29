export const COLLECTION = "hazard_events" as const;

export const PHIVOLCS_URL     = "https://earthquake.phivolcs.dost.gov.ph/" as const;
/**
 * The cyclone bulletin lives on its own page, not /weather. The general weather
 * page carries no bulletin content at all — no wind signals, and not even the
 * stand-down phrase — so nothing there can tell an active cyclone from a calm day.
 */
export const PAGASA_URL       =
  "https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin" as const;
export const PAGASA_FLOOD_URL = "https://bagong.pagasa.dost.gov.ph/flood"   as const;

export const NOAH_DATASET_API_URL =
  "https://huggingface.co/api/datasets/bettergovph/project-noah-hazard-maps" as const;

export const PMTILES_URL =
  "https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/PMTiles/noah_hazard_maps.pmtiles" as const;

export const NOAH_LAYERS = [
  "flood_5yr",
  "flood_25yr",
  "flood_100yr",
  "landslide",
  "debris_flow",
  "storm_surge_ssa1",
  "storm_surge_ssa2",
  "storm_surge_ssa3",
  "storm_surge_ssa4",
] as const;

export const USER_AGENT         = "SaklawClient/1.0" as const;
export const REQUEST_TIMEOUT_MS = 12_000;
export const MAX_RETRY_ATTEMPTS = 3;

/** Back-off bounds. The ceiling keeps a retry storm inside the 60s function timeout. */
export const RETRY_BASE_DELAY_MS = 500;
export const RETRY_MAX_DELAY_MS  = 8_000;

/** Guards against a malformed or hostile upstream response exhausting function memory. */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Only a handful of URLs are ever polled; this is a ceiling, not a working size. */
export const HTTP_CACHE_MAX_ENTRIES = 8;

export const FCM_TOPIC_QUAKE   = "hazards_ph_critical" as const;
export const FCM_TOPIC_CYCLONE = "cyclone_ph_alerts"   as const;
export const FCM_TOPIC_FLOOD   = "flood_ph_alerts"     as const;
export const FCM_TOPIC_GIS     = "gis_layer_updates"   as const;

export const MAX_QUAKE_ROWS = 10;
export const MAG_MIN = 1.0;
export const MAG_MAX = 10.0;
export const QUAKE_NOTIFY_MAG = 5.0;

/**
 * A quake older than this is still saved, but never pushed. Without it, any
 * backfill — a redeploy, a dedupe-key change, or the scheduler catching up
 * after an outage — would alert users about earthquakes that already passed.
 */
export const QUAKE_NOTIFY_MAX_AGE_MINUTES = 60;

/** Philippine Standard Time is UTC+08:00 year-round; the PH observes no DST. */
export const PH_UTC_OFFSET_MINUTES = 8 * 60;

/**
 * The Philippine region, as a sanity filter on scraped coordinates.
 *
 * PHIVOLCS has already decided what is relevant to the Philippines before it
 * publishes, so this box is not a jurisdiction test — it is here to reject a
 * mis-parsed row, and to drop the distant foreign events PHIVOLCS lists for
 * reference. Each edge is set from what the live catalogue actually contains:
 *
 *  - latMin 4.0  keeps out the Molucca Sea cluster in Indonesian waters, which
 *    PHIVOLCS reports as "~300-400 km S of Balut Island" but which is far too
 *    distant to be a Philippine hazard. This edge does real work: it excluded
 *    31 such events in one month, up to M5.3.
 *  - latMax 22.5 reaches past Batanes. At 21.5 the pipeline was silently
 *    dropping earthquakes ~90 km north of Itbayat — inside Philippine waters,
 *    and the only earthquakes the country's northernmost province would feel.
 *  - lonMax 128.5 reaches across the Philippine Trench, where offshore quakes
 *    off Davao Oriental and Samar are tsunami-relevant to the eastern seaboard.
 *  - lonMin 116.0 covers Palawan and the western seaboard.
 */
export const PH_BOUNDS = {
  latMin: 4.0,
  latMax: 22.5,
  lonMin: 116.0,
  lonMax: 128.5,
} as const;

export const PAGASA_NO_CYCLONE_PHRASE =
  "No Active Tropical Cyclone within the Philippine Area of Responsibility" as const;

/** Wrapper around the bulletin body; scopes matching away from the site navigation. */
export const PAGASA_CYCLONE_SCOPE_SELECTOR =
  ".tropical-cyclone-weather-bulletin-page .article-content" as const;

/** Rows of the "18 MAJOR RIVER BASINS" status table on the flood page. */
export const PAGASA_BASIN_ROW_SELECTOR = ".basin-hydro-forecast table tbody tr" as const;

/** Class PAGASA puts on a basin's status link when that basin is under flood watch. */
export const PAGASA_FLOOD_WATCH_CLASS     = "flood"     as const;
export const PAGASA_NON_FLOOD_WATCH_CLASS = "non-flood" as const;

export const MIN_TCWS_SIGNAL = 1;
export const MAX_TCWS_SIGNAL = 5;
