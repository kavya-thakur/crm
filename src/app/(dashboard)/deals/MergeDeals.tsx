"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { DuplicateSuggestions, MergePanel, type MergeFieldSpec, type MergePair } from "@/components/MergePanel";
import { formatDealAmount, refreshDeals, StageLabel, type Deal } from "./shared";

// The fields two copies of a deal can disagree on (the same list as MERGE_DEAL_FIELDS in lib/validations/deals)
const FIELDS: MergeFieldSpec<Deal>[] = [
    { key: "title", label: "Title", value: (deal) => deal.title, show: (deal) => deal.title },
    // 0 is the default for "not known yet", so it's filled in from the other copy
    { key: "amount", label: "Amount", value: (deal) => Number(deal.amount) || null, show: (deal) => formatDealAmount(deal.amount) },
    { key: "probability", label: "Probability", value: (deal) => deal.probability, show: (deal) => `${deal.probability}%` },
    { key: "pipelineStageId", label: "Stage", value: (deal) => deal.pipelineStageId, show: (deal) => <StageLabel stage={deal.pipelineStage} /> },
    {
        key: "expectedCloseDate",
        label: "Expected close",
        value: (deal) => deal.expectedCloseDate?.slice(0, 10) ?? null,
        show: (deal) => deal.expectedCloseDate && formatDate(deal.expectedCloseDate),
    },
    { key: "leadId", label: "Lead", value: (deal) => deal.leadId, show: (deal) => deal.lead?.name },
    {
        key: "assignedToId",
        label: "Assigned to",
        value: (deal) => deal.assignedTo?.id ?? null,
        show: (deal) =>
            deal.assignedTo && (
                <span className="flex min-w-0 items-center gap-1.5">
                    <Avatar name={deal.assignedTo.name} />
                    <span className="truncate">{deal.assignedTo.name}</span>
                </span>
            ),
    },
    { key: "description", label: "Description", value: (deal) => deal.description?.trim() || null, show: (deal) => deal.description },
];

export function MergeDealsPanel({ pair, onClose, onMerged }: { pair: MergePair | null; onClose: () => void; onMerged: (keptId: number) => void }) {
    return (
        <MergePanel
            noun="deal"
            pair={pair}
            fields={FIELDS}
            titleOf={(deal) => deal.title}
            moves="notes, tasks, activities and timeline"
            refresh={refreshDeals}
            onClose={onClose}
            onMerged={onMerged}
        />
    );
}

// In a deal's panel: other deals that look like copies of it, each with a way to merge it in
export function PossibleDuplicateDeals({ deal, onMerge }: { deal: Deal; onMerge: (duplicateId: number) => void }) {
    const similarQuery = useQuery({
        queryKey: ["deal", deal.id, "duplicates", deal.title, deal.leadId],
        queryFn: () =>
            api
                .get<{ data: { id: number; title: string; stage: string; matchedOn: "lead" | "title" }[] }>(`/deals/${deal.id}/duplicates`)
                .then((res) => res.data.data),
    });

    const matches = (similarQuery.data ?? []).map((match) => ({
        id: match.id,
        title: match.title,
        detail: `${match.matchedOn === "lead" ? "another open deal for this lead" : "same title"} · ${match.stage}`,
    }));

    return <DuplicateSuggestions matches={matches} onMerge={onMerge} />;
}
