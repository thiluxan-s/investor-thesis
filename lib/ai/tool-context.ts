import "server-only";
import { createBraveProvider } from "@/lib/ai/tools/providers/brave";
import type { ToolContext } from "@/lib/ai/tools/types";
import { serverEnv } from "@/lib/env.server";

const EDGAR_TICKERS = "https://www.sec.gov/files/company_tickers.json";

async function realFetcher(url: string): Promise<{ status: number; html: string; finalUrl: string }> {
  const res = await fetch(url, { headers: { "User-Agent": serverEnv.EDGAR_USER_AGENT } });
  return { status: res.status, html: await res.text(), finalUrl: res.url };
}

async function realEdgar(ticker: string, formType?: string) {
  const res = await fetch(EDGAR_TICKERS, { headers: { "User-Agent": serverEnv.EDGAR_USER_AGENT } });
  if (!res.ok) throw new Error(`EDGAR lookup failed: ${res.status}`);
  const map = (await res.json()) as Record<string, { ticker: string; cik_str: number }>;
  const entry = Object.values(map).find((e) => e.ticker.toUpperCase() === ticker.toUpperCase());
  if (!entry) throw new Error(`Unknown ticker: ${ticker}`);
  const cik = String(entry.cik_str).padStart(10, "0");
  const subs = (await (
    await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": serverEnv.EDGAR_USER_AGENT },
    })
  ).json()) as {
    filings: { recent: { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] } };
  };
  const r = subs.filings.recent;
  const out: { form: string; filedAt: string; url: string }[] = [];
  for (let i = 0; i < r.form.length && out.length < 10; i++) {
    if (formType && r.form[i] !== formType) continue;
    const acc = r.accessionNumber[i].replace(/-/g, "");
    out.push({
      form: r.form[i],
      filedAt: r.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${entry.cik_str}/${acc}/${r.primaryDocument[i]}`,
    });
  }
  return out;
}

export function buildToolContext(scenario?: string): ToolContext {
  if (serverEnv.USE_AI_FIXTURES) {
    // Fixture replay is driven by the loop's injected client + toolRunner, so
    // the real tool I/O should never be reached. Throwing stubs make any
    // accidental real call loud rather than silently hitting the network.
    const fail = () => {
      throw new Error("Real tool I/O attempted while USE_AI_FIXTURES=1");
    };
    return {
      search: { search: async () => fail() },
      fetcher: async () => fail(),
      edgarClient: async () => fail(),
      useFixtures: true,
      scenario,
    };
  }
  return {
    search: createBraveProvider(serverEnv.BRAVE_API_KEY!),
    fetcher: realFetcher,
    edgarClient: realEdgar,
    useFixtures: false,
    scenario,
  };
}
