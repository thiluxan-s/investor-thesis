import Link from "next/link";

export function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <Link
      href="/demo"
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_44px_-18px_rgba(0,0,0,0.2)]"
    >
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-zinc-300" />
          <span className="size-2.5 rounded-full bg-zinc-300" />
          <span className="size-2.5 rounded-full bg-zinc-300" />
        </span>
        <span className="ml-1.5 flex-1 truncate rounded-md bg-white px-2.5 py-1 font-mono text-[11px] text-zinc-400 ring-1 ring-zinc-200/70">
          {url}
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-zinc-300 transition-colors group-hover:text-primary sm:inline">
          Open demo →
        </span>
      </div>
      <div className="p-5">{children}</div>
    </Link>
  );
}
