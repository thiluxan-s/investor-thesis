import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

const steps = [
  {
    n: "01",
    title: "Write your thesis",
    body: "A position plus 2–5 claims that make it falsifiable.",
  },
  {
    n: "02",
    title: "The agent researches",
    body: "It searches, reads filings, and gathers evidence on a schedule.",
  },
  {
    n: "03",
    title: "Watch the health",
    body: "Each claim strengthens or weakens — every call is inspectable.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="size-[18px] rounded-[5px] bg-primary" />
          Thesis Tracker
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="text-zinc-600 transition-colors hover:text-zinc-900"
            >
              Sign in
            </Link>
            <Button asChild size="sm">
              <Link href="/sign-up">Create your thesis</Link>
            </Button>
          </Show>
          <Show when="signed-in">
            <Button asChild size="sm">
              <Link href="/theses">Go to dashboard</Link>
            </Button>
          </Show>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-24 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
          <div>
            <span className="animate-rise font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary">
              Agentic thesis tracking
            </span>
            <h1
              className="animate-rise mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl"
              style={{ animationDelay: "60ms" }}
            >
              Know when your investment thesis stops being true.
            </h1>
            <p
              className="animate-rise mt-6 max-w-[46ch] text-lg leading-relaxed text-zinc-600"
              style={{ animationDelay: "120ms" }}
            >
              Write your thesis as claims. An AI agent watches the world — news,
              filings, earnings — and shows you, with citations, whether the
              evidence still backs you.
            </p>
            <div
              className="animate-rise mt-8 flex items-center gap-3"
              style={{ animationDelay: "180ms" }}
            >
              <Button asChild size="lg">
                <Link href="/sign-up">Create your thesis</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/demo">Try the demo</Link>
              </Button>
              <span className="text-sm text-zinc-500">No sign-up required</span>
            </div>
          </div>

          <div
            className="animate-rise rounded-xl border border-zinc-200 bg-zinc-50/60 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.12)]"
            style={{ animationDelay: "240ms" }}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                NVDA · LONG
              </span>
              <span className="font-mono text-xs text-zinc-400">6–12 mo</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-zinc-900">
              Long NVDA — data-center thesis
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Overall health{" "}
              <span className="font-mono font-medium text-health-strong">
                +0.62
              </span>{" "}
              · 4 claims · last run 2d ago
            </p>

            <div className="mt-5 space-y-4">
              <ClaimPreview
                label="Data-center revenue grows >40% YoY"
                strong={6}
                neutral={2}
                weak={1}
              />
              <ClaimPreview
                label="CUDA remains a durable moat"
                strong={4}
                neutral={3}
                weak={2}
              />
              <ClaimPreview
                label="Hyperscaler capex stays elevated"
                strong={3}
                neutral={2}
                weak={4}
              />
            </div>

            <p className="mt-5 text-[11px] text-zinc-400">
              8 pieces of evidence collected
            </p>
          </div>
        </section>

        <section className="border-t border-zinc-100">
          <div className="mx-auto grid max-w-6xl divide-y divide-zinc-100 px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {steps.map((s) => (
              <div key={s.n} className="py-8 sm:px-8 sm:first:pl-0 sm:last:pr-0">
                <span className="font-mono text-xs text-primary">{s.n}</span>
                <p className="mt-2.5 font-semibold text-zinc-900">{s.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs text-zinc-400">
          A reasoning tool, not a recommender. Thesis Tracker tracks the position
          you hold — it never tells you to buy or sell.
        </p>
      </footer>
    </div>
  );
}

function ClaimPreview({
  label,
  strong,
  neutral,
  weak,
}: {
  label: string;
  strong: number;
  neutral: number;
  weak: number;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-600">{label}</p>
      <div className="mt-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-zinc-100">
        <span className="bg-health-strong" style={{ flex: strong }} />
        <span className="bg-health-neutral" style={{ flex: neutral }} />
        <span className="bg-health-weak" style={{ flex: weak }} />
      </div>
    </div>
  );
}
