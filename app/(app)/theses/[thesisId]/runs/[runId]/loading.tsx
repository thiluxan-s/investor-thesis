import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-4 h-16 w-full rounded-xl" />
      <div className="mt-6 space-y-4 pl-[30px]">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
