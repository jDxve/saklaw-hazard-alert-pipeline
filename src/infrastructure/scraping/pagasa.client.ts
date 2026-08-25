import * as cheerio from "cheerio";
import { PAGASA_FLOOD_URL, PAGASA_NO_CYCLONE_PHRASE, PAGASA_URL } from "../../config/constants";
import { CycloneBulletin, CycloneSource } from "../../domain/ports/cyclone-source";
import { FloodBulletin, FloodSource } from "../../domain/ports/flood-source";
import { Logger } from "../../domain/ports/logger";
import { HttpClient } from "../http/http-client";
import { detectFloodAlertMarkers, detectMaxTcwsSignal, extractStormName } from "./pagasa.parser";

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

    const bodyText = cheerio.load(html)("body").text();
    const hasActiveCyclone =
      !bodyText.includes(PAGASA_NO_CYCLONE_PHRASE) && bodyText.includes("TROPICAL CYCLONE");

    if (!hasActiveCyclone) {
      this.logger.info("No active tropical cyclone within PAR.");
      return null;
    }

    return {
      stormName: extractStormName(bodyText),
      maxSignal: detectMaxTcwsSignal(bodyText),
    };
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

    const bodyText = cheerio.load(html)("body").text();
    const { hasFloodAlert, isRedAlert, isOrangeAlert } = detectFloodAlertMarkers(bodyText);

    return hasFloodAlert ? { isRedAlert, isOrangeAlert } : null;
  }
}
