import * as cheerio from "cheerio";
import { PAGASA_FLOOD_URL, PAGASA_URL } from "../../config/constants";
import { CycloneBulletin, CycloneSource } from "../../domain/ports/cyclone-source";
import { FloodBulletin, FloodSource } from "../../domain/ports/flood-source";
import { Logger } from "../../domain/ports/logger";
import { HttpClient } from "../http/http-client";
import { parseCycloneBulletin, parseRiverBasinTable } from "./pagasa.parser";

export class PagasaWeatherSource implements CycloneSource {
  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {}

  async fetchActiveCyclone(): Promise<CycloneBulletin | null> {
    let html: string;
    try {
      html = await this.http.getText(PAGASA_URL);
    } catch (err) {
      this.logger.error("HTTP fetch failed after all retries — retaining last known good state", err);
      return null;
    }

    const reading = parseCycloneBulletin(cheerio.load(html));

    switch (reading.kind) {
      case "none":
        this.logger.info("No active tropical cyclone within PAR.");
        return null;

      case "unreadable":
        // Logged as an error, not an all-clear: the page was fetched but could
        // not be understood, so we know nothing about the current state.
        this.logger.error(
          "Cyclone bulletin could not be read — treating as unknown, not as calm",
          new Error(reading.reason),
          { url: PAGASA_URL },
        );
        return null;

      case "active":
        this.logger.info("Active tropical cyclone detected", {
          stormName: reading.bulletin.stormName,
          maxSignal: reading.bulletin.maxSignal,
        });
        return reading.bulletin;
    }
  }
}

export class PagasaFloodSource implements FloodSource {
  constructor(
    private readonly http: HttpClient,
    private readonly logger: Logger,
  ) {}

  async fetchActiveFloodBulletin(): Promise<FloodBulletin | null> {
    let html: string;
    try {
      html = await this.http.getText(PAGASA_FLOOD_URL);
    } catch (err) {
      this.logger.error("Flood HTTP fetch failed after retries", err);
      return null;
    }

    const { monitored, onWatch } = parseRiverBasinTable(cheerio.load(html));

    if (monitored === 0) {
      this.logger.error(
        "River basin table not found — treating as unknown, not as calm",
        new Error("basin table missing or restructured"),
        { url: PAGASA_FLOOD_URL },
      );
      return null;
    }

    if (onWatch.length === 0) {
      this.logger.info("No river basin on flood watch.", { basinsMonitored: monitored });
      return null;
    }

    this.logger.info("River basins on flood watch", {
      basinsMonitored: monitored,
      basinsOnWatch: onWatch.map((basin) => basin.name),
    });

    return { basinsOnWatch: onWatch, basinsMonitored: monitored };
  }
}
