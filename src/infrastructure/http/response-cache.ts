/**
 * Remembers the validator a source sent with its last response, so the next
 * poll can ask "has this changed?" instead of downloading the page again.
 *
 * PHIVOLCS serves an ETag and a 3.8 MB bulletin page. At a two-minute schedule
 * that is ~720 downloads a day of almost entirely identical bytes; revalidating
 * turns the unchanged ones into empty 304s. PAGASA sends no validator at all,
 * which is why entries are only kept when one is present — caching a body we
 * could never revalidate would hold memory for no benefit.
 *
 * The cache lives in the function instance, so a cold start simply pays for one
 * full fetch. It is never a correctness dependency: every entry can be dropped
 * at any time and the next request just returns a 200.
 */
export interface CachedResponse {
  data: unknown;
}

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  data: unknown;
}

export type ResponseHeaders = Record<string, unknown>;

/** HTTP header names are case-insensitive, and transports disagree on casing. */
function headerValue(headers: ResponseHeaders, name: string): string | undefined {
  const wanted = name.toLowerCase();

  for (const [key, raw] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  }
  return undefined;
}

export class ResponseCache {
  /** Insertion-ordered, so the first key is always the least recently stored. */
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly maxEntries: number) {}

  /** Headers that ask the origin to reply 304 if nothing has changed. */
  conditionalHeaders(url: string): Record<string, string> {
    const entry = this.entries.get(url);
    if (!entry) return {};

    const headers: Record<string, string> = {};
    if (entry.etag) headers["If-None-Match"] = entry.etag;
    if (entry.lastModified) headers["If-Modified-Since"] = entry.lastModified;
    return headers;
  }

  /** Wrapped in an object so a cached `undefined` stays distinguishable from a miss. */
  read(url: string): CachedResponse | undefined {
    const entry = this.entries.get(url);
    return entry ? { data: entry.data } : undefined;
  }

  store(url: string, headers: ResponseHeaders, data: unknown): void {
    const etag = headerValue(headers, "etag");
    const lastModified = headerValue(headers, "last-modified");

    if (!etag && !lastModified) {
      // The source stopped sending a validator, so any entry we hold is now
      // unusable — drop it rather than let it go stale in memory.
      this.entries.delete(url);
      return;
    }

    if (!this.entries.has(url) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }

    this.entries.set(url, { etag, lastModified, data });
  }

  get size(): number {
    return this.entries.size;
  }
}
