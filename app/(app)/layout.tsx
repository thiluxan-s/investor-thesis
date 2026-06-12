import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ensureUserExists } from "@/lib/clerk/ensure-user";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureUserExists();
  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between border-b border-zinc-100 px-6 py-3.5">
        <Link href="/theses" className="flex items-center gap-2 font-semibold text-zinc-900">
          <span className="size-[18px] rounded-[5px] bg-primary" />
          Thesis Tracker
        </Link>
        <UserButton />
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
