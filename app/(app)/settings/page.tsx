import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getUserById } from "@/lib/db/repositories/users";
import { DigestToggle } from "@/components/settings/DigestToggle";
import { RunAnalysisButton } from "@/components/settings/RunAnalysisButton";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await getUserById(userId);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>

      <section className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Notifications</p>
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-zinc-100 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-800">Weekly email digest</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              A Sunday summary of what changed across your active theses — emailed only when something moved.
            </p>
          </div>
          <DigestToggle initialEnabled={user.digestEnabled} />
        </div>
      </section>

      <section className="mt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Analysis</p>
        <div className="mt-2 flex items-center justify-between gap-6 border-t border-zinc-100 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-800">Run weekly analysis now</p>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Analyze all active theses immediately and email your digest when the runs finish.
            </p>
          </div>
          <RunAnalysisButton />
        </div>
      </section>
    </div>
  );
}
