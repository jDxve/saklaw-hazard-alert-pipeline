# River-basin geometry: what we looked for, and why the circles are still here

**Question.** Can the 22 hand-placed circles in `config/basin-geography.ts` be
replaced with authoritative polygons for the river basins PAGASA reports flood
watches on?

**Answer.** Not yet. Three candidate sources were evaluated against the live
PAGASA basin list; none is usable, and one would make the app *less* safe.
The circles stay, and the API now labels every basin match `approximate`.

## Sources evaluated

| Source | Polygons | Named | Verdict |
|---|---|---|---|
| **DENR/NAMRIA Geoportal** (`geoportal.gov.ph`) | yes | yes | **The real authority — unobtainable.** Its GeoServer returns `401 Unauthorized` on `/geoserver/ows`; download requires an account and manual export. |
| **HydroBASINS / HydroSHEDS** (WWF) | yes | **no** | Pfafstetter/`HYBAS_ID` only, no geographic names. Assigning "Pampanga" to a numbered polygon by eye is exactly the substitution this investigation exists to prevent. |
| **Glasgow national catchment geodatabase** (PLOS ONE, CC-BY 4.0, IfSAR 5 m DEM) | yes | yes | Excellent provenance, real geometry — **and the wrong definition.** See below. |

## Why the Glasgow dataset was rejected

It is a good dataset. It is not a dataset of PAGASA's basins.

**1. Catchment ≠ DENR river basin.** Areas disagree with the published DENR
figures by −25 % to +15 %:

| Basin | Glasgow km² | DENR km² | Δ |
|---|---:|---:|---:|
| Pampanga | 7 842 | 10 434 | −25 % |
| Bicol | 2 964 | 3 771 | −21 % |
| Mindanao (Rio Grande) | 18 513 | 23 169 | −20 % |
| Apayao-Abulug | 2 816 | 3 372 | −16 % |
| Agno | 5 804 | 5 952 | −2 % |

**2. It systematically excludes river mouths and deltas — where the flooding
is.** D8 flow routing terminates catchments at the coast and splits deltas into
separate small coastal catchments, and the dataset only covers catchments
> 250 km², so the deltas fall into uncovered gaps. Testing 26 cities that DENR
places inside these basins, **11 fell outside** the matching polygon:

| Place | In the named catchment? | Actually contained by |
|---|---|---|
| Aparri — mouth of the Cagayan | no | *no catchment at all* |
| Cotabato City — mouth of the Rio Grande | no | *no catchment at all* |
| Davao City — mouth of the Davao | no | *no catchment at all* |
| San Fernando, Pampanga | no | *no catchment at all* |
| Malolos, Bulacan | no | *no catchment at all* |
| Dagupan — mouth of the Agno | no | `Patalan_Dagupan` |

Adopting these polygons would mean a flood watch on the Pampanga returning
**no alert** for San Fernando and Malolos. That is a false negative in the most
flood-prone populated part of the basin — strictly worse than today's circles,
which err toward over-inclusion.

**3. Three of PAGASA's four sub-basins are absent.** `Magat`, `Pantabangan` and
`Ambuklao-Binga-San Roque` have no counterpart. `Angat` exists but is the whole
river catchment (910 km²), not the dam's contributing watershed (~568 km²).

A cautionary note on name-matching: an automated fuzzy match over this dataset
paired **Pantabangan → Inabanga** (a river in Bohol, ~800 km away) and
**Magat → Pagatban** (Negros). Both are string-similarity artefacts. Basin name
correspondence cannot be automated; it has to be checked one by one.

## What today's circles actually do

Measured against the Glasgow polygons as a sanity reference, the circles are
over-inclusive, which is the safe direction but not free:

- **Davao City matches two basins at once** — `Mindanao` and `Davao` circles
  overlap there.
- **Legazpi City matches `Bicol`**, though it drains to Albay Gulf via the Yawa,
  not the Bicol River.
- **Baguio matches `Agno`**, though it sits in the Bauang catchment.

These are false positives: the app may show a flood watch that does not apply.
That is why every basin match is now returned as
`locationMatch: { type: "area", accuracy: "approximate" }` — so the app can
hedge the wording instead of asserting coverage.

## What would make this production-grade

In order of preference:

1. **DENR-RBCO / NAMRIA official river basin boundaries**, via a Geoportal
   account or a written data request to the River Basin Control Office. This is
   the definition PAGASA's flood forecasting operates on, and the only one whose
   polygons would deserve `accuracy: "authoritative"`.
2. **PAGASA's own FFWS basin service areas** — the operational domains behind
   the basin status table, including the four dam sub-basins. Worth asking
   PAGASA-HMD directly; nothing public exposes them.
3. Failing both, keep the circles and keep them labelled. A wrong polygon
   presented as authoritative is more dangerous than an honest circle.

## Reproducing this

The analysis used the live PAGASA flood page, the DENR published basin areas,
and `Philippines_GIS_catchments_n128.zip` from
<https://doi.org/10.5525/gla.researchdata.1396> (CC-BY 4.0), reprojected from
EPSG:3857 to WGS84 for point-in-polygon testing.
