"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClaimForm } from "@/components/theses/ClaimForm";
import { CategoryBadge } from "@/components/theses/CategoryBadge";
import {
  TIME_HORIZONS,
  CREATE_STATUSES,
  TickerSchema,
  type ClaimInput,
  type PositionDirection,
  type TimeHorizon,
} from "@/schemas/thesis";
import { HORIZON_LABELS, STATUS_LABELS } from "@/lib/theses/labels";
import { MAX_CLAIMS, MIN_CLAIMS } from "@/lib/theses/claim-invariants";
import { createThesis } from "@/app/(app)/theses/actions";

export function NewThesisWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [ticker, setTicker] = useState("");
  const [direction, setDirection] = useState<PositionDirection>("long");
  const [horizon, setHorizon] = useState<TimeHorizon>("6_to_12_months");
  const [status, setStatus] = useState<(typeof CREATE_STATUSES)[number]>("active");
  const [claims, setClaims] = useState<ClaimInput[]>([]);

  // Single source of truth for the ticker rule — same schema the server enforces.
  const tickerOk = TickerSchema.safeParse(ticker).success;
  const titleOk = title.trim().length >= 3;
  const step1Ok = tickerOk && titleOk;

  function submit() {
    startTransition(async () => {
      const res = await createThesis({
        title,
        ticker,
        positionDirection: direction,
        timeHorizon: horizon,
        status,
        claims,
      });
      if (res.ok) {
        router.push(`/theses/${res.data.thesisId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-2.5 text-xs">
        <span className={step === 1 ? "font-semibold text-primary" : "text-zinc-400"}>1 · Position</span>
        <span className="h-1 w-1 rounded-full bg-zinc-300" />
        <span className={step === 2 ? "font-semibold text-primary" : "text-zinc-400"}>2 · Claims</span>
      </div>

      {step === 1 ? (
        <div className="space-y-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">What position are you tracking?</h1>
            <p className="mt-1 text-sm text-zinc-500">Ticker and direction are locked once you create the thesis.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Long NVDA — data center demand" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ticker">Ticker</Label>
            <Input
              id="ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-40 font-mono uppercase"
              placeholder="NVDA"
            />
            <p className="text-[11px] text-zinc-400">1–6 letters. We canonicalize it for you.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <div className="inline-flex overflow-hidden rounded-lg border border-zinc-200">
              {(["long", "short"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`px-4 py-2 text-sm font-medium ${
                    direction === d ? "bg-primary text-primary-foreground" : "text-zinc-500"
                  }`}
                >
                  {d === "long" ? "Long" : "Short"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Time horizon</Label>
            <Select value={horizon} onValueChange={(v) => setHorizon(v as TimeHorizon)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIME_HORIZONS.map((h) => (
                  <SelectItem key={h} value={h}>{HORIZON_LABELS[h]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as (typeof CREATE_STATUSES)[number])}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREATE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-zinc-400">Set to Paused if you&apos;re still planning — the agent won&apos;t run on a paused thesis.</p>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => router.push("/theses")}>Cancel</Button>
            <Button disabled={!step1Ok} onClick={() => setStep(2)}>Next: Claims →</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
              What has to be true?{" "}
              <span className="text-sm font-normal text-zinc-400">
                {claims.length} of {MIN_CLAIMS}–{MAX_CLAIMS}
              </span>
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Falsifiable statements the agent will hunt evidence for.</p>
          </div>

          {claims.map((c, i) => (
            <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CategoryBadge category={c.category} />
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-800">{c.statement}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-zinc-400 hover:text-[#C0492F]"
                  onClick={() => setClaims((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {claims.length < MAX_CLAIMS ? (
            <ClaimForm
              key={claims.length}
              submitLabel="Add claim"
              onSubmit={(input) => setClaims((prev) => [...prev, input])}
            />
          ) : (
            <p className="text-xs text-zinc-400">Maximum of {MAX_CLAIMS} claims reached.</p>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
            <Button disabled={claims.length < MIN_CLAIMS || pending} onClick={submit}>
              {pending ? "Creating…" : "Create thesis"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
