export const COLLECTION = "hazard_events" as const;

export const PHIVOLCS_URL     = "https://earthquake.phivolcs.dost.gov.ph/" as const;
export const PAGASA_URL       = "https://www.pagasa.dost.gov.ph/weather"    as const;
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

export const FCM_TOPIC_QUAKE   = "hazards_ph_critical" as const;
export const FCM_TOPIC_CYCLONE = "cyclone_ph_alerts"   as const;
export const FCM_TOPIC_FLOOD   = "flood_ph_alerts"     as const;
export const FCM_TOPIC_GIS     = "gis_layer_updates"   as const;

export const MAX_QUAKE_ROWS = 10;
export const MAG_MIN = 1.0;
export const MAG_MAX = 10.0;
export const QUAKE_NOTIFY_MAG = 5.0;

export const PH_BOUNDS = {
  latMin: 4.0,
  latMax: 21.5,
  lonMin: 116.0,
  lonMax: 127.5,
} as const;

export const PAGASA_NO_CYCLONE_PHRASE =
  "No Active Tropical Cyclone within the Philippine Area of Responsibility" as const;

export const TCWS_PATTERNS: ReadonlyArray<{ signal: number; markers: readonly string[] }> = [
  { signal: 5, markers: ["Signal No. 5", "TCWS No. 5"] },
  { signal: 4, markers: ["Signal No. 4", "TCWS No. 4"] },
  { signal: 3, markers: ["Signal No. 3", "TCWS No. 3"] },
  { signal: 2, markers: ["Signal No. 2", "TCWS No. 2"] },
] as const;
