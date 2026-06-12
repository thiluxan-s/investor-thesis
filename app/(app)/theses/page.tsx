import { Button } from "@/components/ui/button";

export default function ThesesPage() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Your theses
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Positions you&apos;re tracking. The agent watches each one for new
            evidence.
          </p>
        </div>
        <Button disabled>New thesis</Button>
      </div>

      <div className="mt-14 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 px-6 py-20 text-center">
        <div className="flex size-11 items-center justify-center rounded-lg bg-zinc-50 ring-1 ring-zinc-100">
          <span className="size-4 rounded-[4px] bg-primary/15 ring-1 ring-inset ring-primary/30" />
        </div>
        <p className="mt-5 font-medium text-zinc-900">No theses yet</p>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
          Thesis creation arrives in the next phase. Once it&apos;s here,
          you&apos;ll write a position and a few claims, and the agent takes it
          from there.
        </p>
      </div>
    </div>
  );
}
