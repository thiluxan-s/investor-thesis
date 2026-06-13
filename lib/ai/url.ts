import { createHash } from "node:crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "ref",
]);

export function normalizeUrl(input: string): string {
  const u = new URL(input.trim());
  // Lowercase protocol and hostname (URL constructor already lowercases these, but
  // input may have uppercase scheme — reconstruct from u.protocol + u.hostname)
  u.hostname = u.hostname.toLowerCase();
  // Drop fragment
  u.hash = "";
  // Remove tracking params
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key)) {
      u.searchParams.delete(key);
    }
  }
  // Sort remaining params for stability
  u.searchParams.sort();
  // Build result: strip single trailing slash on path (but not bare root "/")
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const search = u.search; // includes "?" if params exist, else ""
  return u.origin + (path === "/" ? "" : path) + search;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function urlHash(input: string): string {
  return sha256(normalizeUrl(input));
}

export function hostnameOf(input: string): string {
  return new URL(input).hostname.toLowerCase();
}
