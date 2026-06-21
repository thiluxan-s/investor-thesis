import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <div className="mt-3.5">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
          <Skeleton className="mt-6 h-40 w-full rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
