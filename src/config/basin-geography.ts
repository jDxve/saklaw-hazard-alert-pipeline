import { GeoPoint } from "../domain/entities/hazard-event";

/**
 * Approximate geography for PAGASA's monitored river basins.
 *
 * **These are not PAGASA boundaries.** PAGASA publishes basin *names* on the
 * flood page and nothing geographic; the per-basin PDFs carry no machine
 * readable geometry either. Each entry here is a hand-placed centre for the
 * basin's general location, with a radius chosen to cover its rough extent.
 *
 * They exist for one purpose: letting the read API answer "could this flood
 * watch reach my pin?" instead of returning every national flood event to
 * every user. A point inside the circle means *possibly affected, check the
 * bulletin* — never *inside the flood zone*. Everything derived from this is
 * surfaced through fields named `approximate*` for that reason.
 *
 * A basin absent from this table is not a failure: the API returns the event
 * with no approximate geometry rather than inventing a location for it.
 *
 * **These are still circles on purpose.** Authoritative polygons were looked
 * for and not adopted — see `docs/basin-geometry-investigation.md`. In short:
 * the DENR/NAMRIA Geoportal needs an account, HydroBASINS carries no basin
 * names, and the one open named polygon set (Glasgow, CC-BY) delineates
 * hydrological catchments rather than DENR river basins — it excludes Aparri,
 * Cotabato City, Davao City, San Fernando and Malolos from their own basins,
 * which would turn a real flood watch into silence exactly where the flooding
 * happens. Circles over-include; that is the safer failure, and the API says
 * `accuracy: "approximate"` so nothing downstream mistakes them for boundaries.
 *
 * Known over-inclusions, measured: Davao City falls in both the Mindanao and
 * Davao circles; Legazpi matches Bicol though it drains to Albay Gulf; Baguio
 * matches Agno though it sits in the Bauang catchment.
 */
export interface BasinGeography {
  center: GeoPoint;
  /** Covers the basin's rough extent, deliberately generous. */
  approximateRadiusKm: number;
}

/** Keyed by PAGASA's own basin name, lowercased and space-collapsed. */
export const BASIN_GEOGRAPHY: ReadonlyMap<string, BasinGeography> = new Map([
  // --- Luzon ---
  ["cagayan", { center: { lat: 17.4, lon: 121.7 }, approximateRadiusKm: 130 }],
  ["pampanga", { center: { lat: 15.3, lon: 120.9 }, approximateRadiusKm: 70 }],
  ["agno", { center: { lat: 15.9, lon: 120.5 }, approximateRadiusKm: 60 }],
  ["abra", { center: { lat: 17.5, lon: 120.8 }, approximateRadiusKm: 55 }],
  ["apayao-abulug", { center: { lat: 18.2, lon: 121.2 }, approximateRadiusKm: 50 }],
  ["bicol", { center: { lat: 13.4, lon: 123.4 }, approximateRadiusKm: 55 }],
  [
    "ncr/pasig marikina laguna de bay",
    { center: { lat: 14.5, lon: 121.1 }, approximateRadiusKm: 40 },
  ],
  ["angat sub-basin", { center: { lat: 14.9, lon: 121.2 }, approximateRadiusKm: 25 }],
  [
    "ambuklao-binga-san roque sub-basin",
    { center: { lat: 16.4, lon: 120.7 }, approximateRadiusKm: 35 },
  ],
  ["pantabangan sub-basin", { center: { lat: 15.8, lon: 121.1 }, approximateRadiusKm: 25 }],
  ["magat sub-basin", { center: { lat: 16.8, lon: 121.3 }, approximateRadiusKm: 40 }],

  // --- Visayas ---
  ["ilog-hilabangan", { center: { lat: 10.0, lon: 122.9 }, approximateRadiusKm: 45 }],
  ["jalaur", { center: { lat: 11.1, lon: 122.5 }, approximateRadiusKm: 35 }],
  ["panay", { center: { lat: 11.4, lon: 122.4 }, approximateRadiusKm: 45 }],

  // --- Mindanao ---
  ["agusan", { center: { lat: 8.5, lon: 125.8 }, approximateRadiusKm: 90 }],
  ["mindanao", { center: { lat: 7.2, lon: 124.5 }, approximateRadiusKm: 110 }],
  ["davao", { center: { lat: 7.2, lon: 125.4 }, approximateRadiusKm: 50 }],
  ["tagum-libuganon", { center: { lat: 7.6, lon: 125.8 }, approximateRadiusKm: 45 }],
  ["buayan-malungon", { center: { lat: 6.3, lon: 125.2 }, approximateRadiusKm: 35 }],
  ["agus", { center: { lat: 7.9, lon: 124.1 }, approximateRadiusKm: 40 }],
  ["cagayan de oro", { center: { lat: 8.4, lon: 124.6 }, approximateRadiusKm: 40 }],
  ["tagoloan", { center: { lat: 8.3, lon: 124.9 }, approximateRadiusKm: 40 }],
]);

export function basinGeography(name: string): BasinGeography | null {
  return BASIN_GEOGRAPHY.get(name.replace(/\s+/g, " ").trim().toLowerCase()) ?? null;
}
