import axios from "axios";
import { Logger } from "../../domain/ports/logger";
import { withRetry } from "./with-retry";

export interface HttpClient {
  getText(url: string): Promise<string>;
  getJson<T>(url: string): Promise<T>;
}

export class AxiosHttpClient implements HttpClient {
  constructor(
    private readonly timeoutMs: number,
    private readonly userAgent: string,
    private readonly maxRetryAttempts: number,
    private readonly logger: Logger,
  ) {}

  getText(url: string): Promise<string> {
    return this.get<string>(url);
  }

  getJson<T>(url: string): Promise<T> {
    return this.get<T>(url);
  }

  private async get<T>(url: string): Promise<T> {
    const response = await withRetry(
      () => axios.get<T>(url, {
        timeout: this.timeoutMs,
        headers: { "User-Agent": this.userAgent },
      }),
      this.maxRetryAttempts,
      this.logger,
      `GET ${url}`,
    );
    return response.data;
  }
}
