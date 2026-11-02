"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { StageBadge } from "@/components/StageBadge";
import { Avatar } from "@/components/Avatar";
import { DuplicateSuggestions, MergePanel, type MergeFieldSpec, type MergePair } from "@/components/MergePanel";
import { refreshLeads, StageLabel, type Lead, type SimilarLead } from "./shared";

// The fields two copies of a lead can disagree on (the same list as MERGE_FIELDS in lib/validations/leads)
const FIELDS: MergeFieldSpec<Lead>[] = [
    { key: "name", label: "Name", value: (lead) => lead.name, show: (lead) => lead.name },
    { key: "email", label: "Email", value: (lead) => lead.email?.toLowerCase() || null, show: (lead) => lead.email },
    // "+91 98765-43210" and "9876543210" are the same number
    { key: "phone", label: "Phone", value: (lead) => lead.phone?.replace(/\D/g, "").slice(-10) || null, show: (lead) => lead.phone },
    { key: "companyName", label: "Company", value: (lead) => lead.companyName || null, show: (lead) => lead.companyName },
    { key: "stageId", label: "Stage", value: (lead) => lead.stageId, show: (lead) => <StageLabel stage={lead.stage} /> },
    { key: "sourceId", label: "Source", value: (lead) => lead.sourceId, show: (lead) => lead.source && <StageBadge name={lead.source.name} color={lead.source.color} /> },
    {
        key: "assignedToId",
        label: "Assigned to",
        value: (lead) => lead.assignedTo?.id ?? null,
        show: (lead) =>
            lead.assignedTo && (
                <span className="flex min-w-0 items-center gap-1.5">
                    <Avatar name={lead.assignedTo.name} />
                    <span className="truncate">{lead.assignedTo.name}</span>
                </span>
            ),
    },
];

export function MergeLeadsPanel({ pair, onClose, onMerged }: { pair: MergePair | null; onClose: () => void; onMerged: (keptId: number) => void }) {
    return (
        <MergePanel
            noun="lead"
            pair={pair}
            fields={FIELDS}
            titleOf={(lead) => lead.name}
            moves="notes, tasks, activities, deals and timeline"
            refresh={refreshLeads}
            onClose={onClose}
            onMerged={onMerged}
        />
    );
}

// In an open lead's panel: other open leads with the same email or phone, to merge in. A lost
// or converted lead for the same person is a past opportunity, not a copy, so it isn't offered.
export function PossibleDuplicates({ lead, onMerge }: { lead: Lead; onMerge: (duplicateId: number) => void }) {
    const open = !lead.stage.isConverted && !lead.stage.isLost;
    const similarQuery = useQuery({
        queryKey: ["lead", lead.id, "duplicates", lead.email, lead.phone],
        queryFn: () =>
            api
                .get<{ data: SimilarLead[] }>("/leads/duplicates", { params: { email: lead.email || undefined, phone: lead.phone || undefined, exceptId: lead.id } })
                .then((res) => res.data.data),
        enabled: open && Boolean(lead.email || lead.phone),
    });

    // only ones this person can open can be merged
    const matches = (open ? (similarQuery.data ?? []) : [])
        .filter((match) => match.open && match.canOpen)
        .map((match) => ({ id: match.id, title: match.name, detail: `same ${match.matchedOn} · ${match.stage.name}` }));

    return <DuplicateSuggestions matches={matches} onMerge={onMerge} />;
}
