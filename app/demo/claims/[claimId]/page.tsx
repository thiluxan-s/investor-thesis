import Link from "next/link";
import { notFound } from "next/navigation";
import { getDemoThesis } from "@/lib/demo/queries";
import { listClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";
import { DemoBanner } from "@/components/demo/DemoBanner";
import { ClaimDrilldown } from "@/components/theses/ClaimDrilldown";

// Public, DB-reading page. A static prerender attempt breaks the Vercel build,
// so the marker is explicit rather than inferred from the dynamic segment.
export const dynamic = "force-dynamic";

export default async function DemoClaimPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const { claimId } = await params;
  const thesis = await getDemoThesis();
  if (!thesis) notFound();

  // getDemoThesis is scoped to DEMO_THESIS_ID and orders claims by ordinal, so
  // this lookup cannot reach another user's claim.
  const index = thesis.claims.findIndex((c) => c.id === claimId);
  if (index === -1) notFound();

  const rows = await listClaimEvidenceDetail(claimId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <DemoBanner />
      <Link href="/demo" className="text-xs text-zinc-400 hover:text-zinc-600">
        ← Back to the demo thesis
      </Link>
      <div className="mt-3.5">
        <ClaimDrilldown
          claim={thesis.claims[index]}
          claimNumber={index + 1}
          rows={rows}
          runHrefBase="/demo/runs"
        />
      </div>
    </div>
  );
}
