import assert from "node:assert/strict";
import { test } from "node:test";
import { ResponseCache } from "./response-cache";

const PHIVOLCS = "https://earthquake.phivolcs.dost.gov.ph/";
const PAGASA = "https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin";

/** The real validator PHIVOLCS returns, weak-comparison prefix and all. */
const ETAG = 'W/"6a924aaa-3a752b"';
const LAST_MODIFIED = "Sat, 29 Aug 2026 02:57:46 GMT";

test("sends no conditional headers before anything is cached", () => {
  const cache = new ResponseCache(8);
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), {});
});

test("offers the stored ETag back on the next poll", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { etag: ETAG }, "<html>quakes</html>");
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), { "If-None-Match": ETAG });
});

test("offers Last-Modified when that is the only validator", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { "last-modified": LAST_MODIFIED }, "<html/>");
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), { "If-Modified-Since": LAST_MODIFIED });
});

test("sends both validators when the source provides both", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { etag: ETAG, "last-modified": LAST_MODIFIED }, "<html/>");
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), {
    "If-None-Match": ETAG,
    "If-Modified-Since": LAST_MODIFIED,
  });
});

test("returns the stored body so a 304 can be answered", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { etag: ETAG }, "<html>quakes</html>");
  assert.deepEqual(cache.read(PHIVOLCS), { data: "<html>quakes</html>" });
});

test("stores nothing when the source sends no validator", () => {
  // PAGASA sends only cache-control, so there is nothing to revalidate against
  // and holding its page would waste memory on every poll.
  const cache = new ResponseCache(8);
  cache.store(PAGASA, { "cache-control": "max-age=60" }, "<html>bulletin</html>");
  assert.equal(cache.size, 0);
  assert.equal(cache.read(PAGASA), undefined);
  assert.deepEqual(cache.conditionalHeaders(PAGASA), {});
});

test("drops an existing entry if the source stops sending a validator", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { etag: ETAG }, "first");
  cache.store(PHIVOLCS, { "cache-control": "no-store" }, "second");
  assert.equal(cache.read(PHIVOLCS), undefined);
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), {});
});

test("a later response replaces the earlier validator and body", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { etag: 'W/"old"' }, "old body");
  cache.store(PHIVOLCS, { etag: 'W/"new"' }, "new body");
  assert.equal(cache.size, 1);
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), { "If-None-Match": 'W/"new"' });
  assert.deepEqual(cache.read(PHIVOLCS), { data: "new body" });
});

test("reads header names case-insensitively", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { ETag: ETAG }, "<html/>");
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), { "If-None-Match": ETAG });
});

test("takes the first value when a header arrives repeated", () => {
  const cache = new ResponseCache(8);
  cache.store(PHIVOLCS, { etag: [ETAG, 'W/"other"'] }, "<html/>");
  assert.deepEqual(cache.conditionalHeaders(PHIVOLCS), { "If-None-Match": ETAG });
});

test("evicts the oldest entry once the ceiling is reached", () => {
  const cache = new ResponseCache(2);
  cache.store("https://a.test/", { etag: '"a"' }, "a");
  cache.store("https://b.test/", { etag: '"b"' }, "b");
  cache.store("https://c.test/", { etag: '"c"' }, "c");

  assert.equal(cache.size, 2);
  assert.equal(cache.read("https://a.test/"), undefined);
  assert.deepEqual(cache.read("https://c.test/"), { data: "c" });
});

test("refreshing an existing url does not evict anything", () => {
  const cache = new ResponseCache(2);
  cache.store("https://a.test/", { etag: '"a"' }, "a");
  cache.store("https://b.test/", { etag: '"b"' }, "b");
  cache.store("https://a.test/", { etag: '"a2"' }, "a2");

  assert.equal(cache.size, 2);
  assert.deepEqual(cache.read("https://b.test/"), { data: "b" });
});

test("keeps entries for different urls apart", () => {
  const cache = new ResponseCache(8);
  cache.store("https://a.test/", { etag: '"a"' }, "a");
  cache.store("https://b.test/", { etag: '"b"' }, "b");
  assert.deepEqual(cache.conditionalHeaders("https://a.test/"), { "If-None-Match": '"a"' });
  assert.deepEqual(cache.conditionalHeaders("https://b.test/"), { "If-None-Match": '"b"' });
});

test("can cache a parsed JSON body, not just markup", () => {
  const cache = new ResponseCache(8);
  cache.store("https://api.test/", { etag: '"v1"' }, { sha: "abc123" });
  assert.deepEqual(cache.read("https://api.test/"), { data: { sha: "abc123" } });
});
