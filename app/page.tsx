import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { BrowserFrame } from "@/components/landing/BrowserFrame";
import { Reveal } from "@/components/landing/Reveal";
import { ShowcaseDashboard } from "@/components/landing/ShowcaseDashboard";
import { ShowcaseTrace } from "@/components/landing/ShowcaseTrace";

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

          <div className="animate-rise" style={{ animationDelay: "240ms" }}>
            <BrowserFrame url="thesistracker.app/demo">
              <ShowcaseDashboard />
            </BrowserFrame>
          </div>
        </section>

        <section className="border-t border-zinc-100">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary">
                Watch the agent think
              </span>
              <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight">
                Every verdict shows its work.
              </h2>
              <p className="mt-4 max-w-[42ch] leading-relaxed text-zinc-600">
                The agent plans, searches, reads the source, and evaluates each
                finding against your claims — and you see the whole trail: the
                reasoning, the tool calls, the evidence, and how it scored.
              </p>
            </div>
            <Reveal>
              <BrowserFrame url="thesistracker.app/demo">
                <ShowcaseTrace />
              </BrowserFrame>
            </Reveal>
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
