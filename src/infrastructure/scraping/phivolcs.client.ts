import * as cheerio from "cheerio";
import { MAX_QUAKE_ROWS, PHIVOLCS_URL } from "../../config/constants";
import { Logger } from "../../domain/ports/logger";
import { QuakeObservation, QuakeSource } from "../../domain/ports/quake-source";
import { HttpClient } from "../http/http-client";
import { parsePhivolcsDate, parseQuakeRow } from "./phivolcs.parser";

export class PhivolcsQuakeSource implements QuakeSource {
  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {}

  async fetchRecentQuakes(): Promise<QuakeObservation[]> {
    let html: string;
    try {
      html = await this.http.getText(PHIVOLCS_URL);
    } catch (err) {
      this.logger.error("HTTP fetch failed after all retries — retaining last known good state", err);
      return [];
    }

    const $ = cheerio.load(html);
    const rows = $("table tr").toArray().slice(0, MAX_QUAKE_ROWS);
    const observations: QuakeObservation[] = [];

    for (const row of rows) {
      try {
        const parsed = parseQuakeRow($, row);
        if (!parsed) continue;

        const occurredAt = parsePhivolcsDate(parsed.dateRaw);
        if (!occurredAt) {
          this.logger.warn("Unparseable quake date — row skipped", { dateRaw: parsed.dateRaw });
          continue;
        }

        observations.push({
          occurredAt,
          lat: parsed.lat,
          lon: parsed.lon,
          depthKm: parsed.depthKm,
          magnitude: parsed.magnitude,
          location: parsed.location,
        });
      } catch (rowErr) {
        this.logger.warn("Unexpected error parsing quake row — skipped", {
          errorMessage: rowErr instanceof Error ? rowErr.message : String(rowErr),
        });
      }
    }

    return observations;
  }
}
