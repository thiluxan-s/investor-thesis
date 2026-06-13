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
] as const;

// Matches investor.nvidia.com, investors.apple.com, etc.
const IR_SUBDOMAIN = /^investors?\./;

export function isAllowedDomain(url: string): boolean {
  let host: string;
  try {
    host = hostnameOf(url);
  } catch {
    return false;
  }

  // Allow company IR subdomains (investor.* / investors.*)
  if (IR_SUBDOMAIN.test(host)) return true;

  // Allow exact match or subdomain of a listed domain
  for (const domain of ALLOWED_DOMAINS) {
    if (host === domain || host.endsWith("." + domain)) {
      return true;
    }
  }

  return false;
}
