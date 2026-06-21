import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-8 border-t border-zinc-200">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-6 border-b border-zinc-100 px-2 py-4"
          >
            <div>
              <Skeleton className="h-4 w-64" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
            <Skeleton className="h-1.5 w-20" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
