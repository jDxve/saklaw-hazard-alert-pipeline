import assert from "node:assert/strict";
import { test } from "node:test";
import { X509Certificate } from "node:crypto";
import { PHIVOLCS_ISSUER_CA } from "./phivolcs-ca";

const certificate = new X509Certificate(PHIVOLCS_ISSUER_CA);

test("the bundled certificate is the GlobalSign intermediate PHIVOLCS omits", () => {
  assert.match(certificate.subject, /CN=GlobalSign RSA OV SSL CA 2018/);
  assert.match(certificate.issuer, /GlobalSign Root CA - R3/);
});

test("it is a CA certificate, not a leaf", () => {
  assert.equal(certificate.ca, true);
});

/**
 * The point of this one is to fail loudly and early. If it ever goes red,
 * PHIVOLCS is about to become unreachable from Cloud Functions: refresh the
 * bundle from http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt, or
 * check whether PHIVOLCS has started sending a complete chain and delete it.
 */
const RENEWAL_WINDOW_DAYS = 90;

test(`it is valid, with more than ${RENEWAL_WINDOW_DAYS} days left`, () => {
  const now = Date.now();
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);

  assert.ok(now >= validFrom, "certificate is not valid yet");

  const daysLeft = Math.floor((validTo - now) / 86_400_000);
  assert.ok(
    daysLeft > RENEWAL_WINDOW_DAYS,
    `expires in ${daysLeft} days — refresh the bundled intermediate`,
  );
});
