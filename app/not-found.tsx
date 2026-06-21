import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <span className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-primary">404</span>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">Page not found</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back home</Link>
      </Button>
    </div>
  );
}
