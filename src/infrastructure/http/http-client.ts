import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { MAX_RESPONSE_BYTES } from "../../config/constants";
import { Logger } from "../../domain/ports/logger";
import { withRetry } from "./with-retry";

export interface HttpClient {
  getText(url: string): Promise<string>;
  getJson<T>(url: string): Promise<T>;
}

export class AxiosHttpClient implements HttpClient {
  private readonly client: AxiosInstance;

  constructor(
    timeoutMs: number,
    userAgent: string,
    private readonly maxRetryAttempts: number,
    private readonly logger: Logger,
  ) {
    // A warm function instance polls the same few hosts every couple of
    // minutes, so keeping sockets alive skips a TLS handshake per poll.
    this.client = axios.create({
      timeout: timeoutMs,
      headers: { "User-Agent": userAgent, "Accept-Encoding": "gzip, deflate" },
      maxRedirects: 5,
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      httpAgent: new HttpAgent({ keepAlive: true }),
      httpsAgent: new HttpsAgent({ keepAlive: true }),
    });
  }

  getText(url: string): Promise<string> {
    // `transformResponse` is neutralised so a page served with a JSON content
    // type still arrives as markup for Cheerio, instead of a parsed object.
    return this.get<string>(url, {
      responseType: "text",
      transformResponse: [(body: unknown) => body],
      headers: { Accept: "text/html,application/xhtml+xml,*/*" },
    });
  }

  getJson<T>(url: string): Promise<T> {
    return this.get<T>(url, {
      responseType: "json",
      headers: { Accept: "application/json" },
    });
  }

  private async get<T>(url: string, config: AxiosRequestConfig): Promise<T> {
    const response = await withRetry(
      () => this.client.get<T>(url, config),
      this.maxRetryAttempts,
      this.logger,
      `GET ${url}`,
    );
    return response.data;
  }
}
