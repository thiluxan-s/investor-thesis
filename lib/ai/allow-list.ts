import { hostnameOf } from "./url";

export const ALLOWED_DOMAINS = [
  "sec.gov",
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "cnbc.com",
  "marketwatch.com",
  "barrons.com",
  "finance.yahoo.com",
  "seekingalpha.com",
  "fool.com",
  "theverge.com",
  "arstechnica.com",
  "semianalysis.com",
  // Company investor-relations hosts are allow-listed EXPLICITLY — never via a
  // wildcard like `investor.*`, which would let any attacker-controlled host
  // (e.g. investor.evil.test) through. Add issuers here as needed.
  "investor.nvidia.com",
] as const;

export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = hostnameOf(url);
  } catch {
    return false;
  }

  // Allow exact match or subdomain of a listed domain
  for (const domain of ALLOWED_DOMAINS) {
    if (host === domain || host.endsWith("." + domain)) {
      return true;
    }
  }

  return false;
}
