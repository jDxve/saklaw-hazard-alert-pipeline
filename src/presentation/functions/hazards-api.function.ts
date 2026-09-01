import { onRequest } from "firebase-functions/v2/https";
import { QueryHazardsUseCase } from "../../application/use-cases/query-hazards.use-case";
import { GisManifest } from "../../domain/ports/gis-manifest.repository";
import { Logger } from "../../domain/ports/logger";
import { parseHazardQuery } from "../http/hazard-request";
import { toHazardResponse } from "../http/hazard-response";

export interface HazardsApiDeps {
  queryHazards: QueryHazardsUseCase;
  readManifest: () => Promise<GisManifest | null>;
  logger: Logger;
  now?: () => Date;
}

/** `/api/v1/hazards/pagasa_tc_2026-09-01T05_snone` -> the id. */
const HAZARD_BY_ID = /^\/api\/v1\/hazards\/(.+)$/;
const HAZARD_LIST = "/api/v1/hazards";
const LAYER_MANIFEST = "/api/v1/layers/manifest";

/**
 * The app's read path into the hazard store.
 *
 * Read-only by construction: the use case exposes no writes, so no route here
 * can mutate anything the ingestion pipeline owns.
 */
export function registerHazardsApi(deps: HazardsApiDeps) {
  const now = deps.now ?? (() => new Date());

  return onRequest(
    { region: "asia-southeast1", timeoutSeconds: 30, memory: "256MiB", cors: true },
    async (req, res) => {
      if (req.method !== "GET") {
        res.set("Allow", "GET");
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      // Hazard readings change on a 2-5 minute ingestion cadence; a minute of
      // shared caching absorbs a launch spike without letting a warning go
      // stale in front of a reader.
      res.set("Cache-Control", "public, max-age=60");

      const path = (req.path || "/").replace(/\/+$/, "") || "/";

      try {
        if (path === LAYER_MANIFEST) {
          const manifest = await deps.readManifest();
          if (!manifest) {
            res.status(404).json({ error: "No layer manifest recorded yet" });
            return;
          }
          res.status(200).json(manifest);
          return;
        }

        const byId = HAZARD_BY_ID.exec(path);
        if (byId) {
          const result = await deps.queryHazards.findById(decodeURIComponent(byId[1]));
          if (!result) {
            res.status(404).json({ error: "Hazard not found" });
            return;
          }
          res.status(200).json(toHazardResponse(result));
          return;
        }

        if (path === HAZARD_LIST) {
          const parsed = parseHazardQuery(req.query as Record<string, unknown>, now());
          if (!parsed.ok) {
            res.status(400).json({ error: parsed.error });
            return;
          }

          const results = await deps.queryHazards.execute(parsed.request);
          res.status(200).json({
            hazards: results.map(toHazardResponse),
            query: {
              ...parsed.request,
              // Named so a client cannot mistake the interim basin circles for
              // official hazard boundaries.
              approximateAreaGeometry: true,
            },
          });
          return;
        }

        res.status(404).json({ error: "Not Found" });
      } catch (err) {
        // The cause stays in the logs rather than the response body.
        deps.logger.error("Hazard API request failed", err, { path });
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );
}
