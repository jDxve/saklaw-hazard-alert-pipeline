import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { rootCertificates } from "node:tls";
import { HTTP_CACHE_MAX_ENTRIES, MAX_RESPONSE_BYTES } from "../../config/constants";
import { Logger } from "../../domain/ports/logger";
import { PHIVOLCS_ISSUER_CA } from "./phivolcs-ca";
import { ResponseCache } from "./response-cache";
import { withRetry } from "./with-retry";

export interface HttpClient {
  getText(url: string): Promise<string>;
  getJson<T>(url: string): Promise<T>;
}

const NOT_MODIFIED = 304;

export class AxiosHttpClient implements HttpClient {
  private readonly client: AxiosInstance;
  private readonly cache = new ResponseCache(HTTP_CACHE_MAX_ENTRIES);

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
      httpsAgent: new HttpsAgent({
        keepAlive: true,
        // Node's own roots, plus the one intermediate PHIVOLCS forgets to send.
        // Certificate verification stays on for every host.
        ca: [...rootCertificates, PHIVOLCS_ISSUER_CA],
      }),
      // 304 is a successful answer to a conditional request, not a failure.
      // Without this axios would reject it and the retry layer would see an error.
      validateStatus: (status) => status === NOT_MODIFIED || (status >= 200 && status < 300),
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
    const response = await this.request<T>(url, config, this.cache.conditionalHeaders(url));

    if (response.status !== NOT_MODIFIED) {
      this.cache.store(url, response.headers as Record<string, unknown>, response.data);
      return response.data;
    }

    const cached = this.cache.read(url);
    if (cached) {
      this.logger.info("Source unchanged since last poll — reusing cached body", { url });
      return cached.data as T;
    }

    // Only reachable if the entry disappeared after its validator was sent.
    // Ask again unconditionally so a 304 we cannot satisfy never fails a sync.
    const fresh = await this.request<T>(url, config, {});
    this.cache.store(url, fresh.headers as Record<string, unknown>, fresh.data);
    return fresh.data;
  }

  private request<T>(
    url: string,
    config: AxiosRequestConfig,
    conditionalHeaders: Record<string, string>,
  ): Promise<AxiosResponse<T>> {
    return withRetry(
      () => this.client.get<T>(url, {
        ...config,
        headers: { ...config.headers, ...conditionalHeaders },
      }),
      this.maxRetryAttempts,
      this.logger,
      `GET ${url}`,
    );
  }
}
