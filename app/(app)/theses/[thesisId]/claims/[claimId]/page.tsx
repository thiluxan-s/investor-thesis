import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth/require-user";
import { getThesisForUser } from "@/lib/db/repositories/theses";
import { listClaimEvidenceDetail } from "@/lib/db/repositories/claim-evidence-links";
import { ClaimDrilldown } from "@/components/theses/ClaimDrilldown";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ thesisId: string; claimId: string }>;
}) {
  const { thesisId, claimId } = await params;
  const userId = await requireUserId();
  const thesis = await getThesisForUser(userId, thesisId);
  if (!thesis) notFound();

  // getThesisForUser scopes by userId and orders claims by ordinal, so this one
  // lookup enforces ownership AND claim-belongs-to-thesis. A claim id from
  // another thesis simply isn't in the list.
  const index = thesis.claims.findIndex((c) => c.id === claimId);
  if (index === -1) notFound();

  const rows = await listClaimEvidenceDetail(claimId);

  return (
    <div>
      {/* Segmented: at three levels deep a single link spanning the whole trail
          means "Theses" doesn't go to the thesis index, which is the one place
          the word implies. Each segment points where it reads. */}
      <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Link href="/theses" className="hover:text-zinc-600">
          Theses
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/theses/${thesisId}`} className="hover:text-zinc-600">
          {thesis.ticker}
        </Link>
        <span aria-hidden>/</span>
        <span className="text-zinc-500">Claim {index + 1}</span>
      </nav>
      <div className="mt-3.5">
        <ClaimDrilldown
          claim={thesis.claims[index]}
          claimNumber={index + 1}
          rows={rows}
          runHrefBase={`/theses/${thesisId}/runs`}
        />
      </div>
    </div>
  );
}
