"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBuilding, IconMail, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import {
    StageLabel,
    refreshLeads,
    type Lead,
    type LeadFilters,
    type LeadStage,
    type Paginated,
} from "./shared";

// ponytail: each column shows its first 100 leads; add "load more" per column when that's not enough
const COLUMN_LIMIT = 100;

interface LeadsBoardProps {
    filters: LeadFilters;
    canMove: boolean;
    onOpen: (id: number) => void;
    onError: (message: string) => void;
}

interface StagesResponse {
    ok: boolean;
    data: LeadStage[];
}

// One column per stage. Dragging a card to another column moves it there.
export default function LeadsBoard({ filters, canMove, onOpen, onError }: LeadsBoardProps) {
    const stagesQuery = useQuery({
        queryKey: ["leadStage"],
        queryFn: () => api.get<StagesResponse>("/lead-stages").then((res) => res.data.data),
    });

    if (stagesQuery.isPending) {
        return <PageLoader label="Loading stages" variant="board" className="h-full" />;
    }
    if (stagesQuery.isError) {
        return (
            <ErrorState
                title="Couldn't load stages"
                error={stagesQuery.error}
                onRetry={() => stagesQuery.refetch()}
                retrying={stagesQuery.isFetching}
            />
        );
    }

    const stages = filters.stageId === undefined
        ? stagesQuery.data
        : stagesQuery.data.filter((stage) => stage.id === filters.stageId);

    if (stages.length === 0) {
        return <p className="p-4 text-sm text-faint">No lead stages configured yet.</p>;
    }

    return (
        <div className="flex h-full min-w-max">
            {stages.map((stage) => (
                <BoardColumn
                    key={stage.id}
                    stage={stage}
                    filters={filters}
                    canMove={canMove}
                    onOpen={onOpen}
                    onError={onError}
                />
            ))}
        </div>
    );
}

function BoardColumn({ stage, filters, canMove, onOpen, onError }: LeadsBoardProps & { stage: LeadStage }) {
    const queryClient = useQueryClient();
    const [dragOver, setDragOver] = useState(false);

    const { data } = useQuery({
        queryKey: ["leads", "board", { ...filters, stageId: stage.id }],
        queryFn: () =>
            api
                .get<Paginated<Lead>>("/leads", { params: { ...filters, stageId: stage.id, limit: COLUMN_LIMIT } })
                .then((res) => res.data),
        placeholderData: keepPreviousData,
    });

    const move = useMutation({
        mutationFn: (id: number) => api.put(`/leads/${id}`, { stageId: stage.id }),
        onSuccess: () => {
            toast.success(`Lead moved to ${stage.name}`);
            refreshLeads(queryClient);
        },
        onError: (error) => onError(errorMessage(error)),
    });

    return (
        <section
            onDragOver={(e) => {
                if (!canMove) return;
                e.preventDefault(); // allows dropping here
                setDragOver(true);
            }}
            onDragLeave={(e) => {
                // dragleave also fires when moving onto a card inside the column; ignore that
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
            }}
            onDrop={(e) => {
                setDragOver(false);
                const id = Number(e.dataTransfer.getData("lead-id")); // 0 for anything that isn't a lead card
                if (id && Number(e.dataTransfer.getData("lead-stage-id")) !== stage.id) move.mutate(id);
            }}
            className={`flex w-64 shrink-0 flex-col border-r border-line-light ${dragOver ? "bg-accent-faint" : ""}`}
        >
            <header className="flex h-10 shrink-0 items-center gap-2 px-2">
                <StageLabel stage={stage} />
                <span className="text-faint">{data?.pagination.total}</span>
            </header>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {data?.data.map((lead) => (
                    <article
                        key={lead.id}
                        draggable={canMove}
                        onDragStart={(e) => {
                            e.dataTransfer.setData("lead-id", String(lead.id));
                            e.dataTransfer.setData("lead-stage-id", String(lead.stageId));
                        }}
                        onClick={() => onOpen(lead.id)}
                        className="cursor-pointer rounded-lg border border-line bg-surface p-2 hover:border-line-strong hover:shadow-light"
                    >
                        <p className="flex items-center gap-1.5 font-medium">
                            <Avatar name={lead.name} />
                            <span className="truncate">{lead.name}</span>
                        </p>

                        <div className="mt-2 space-y-1 text-muted">
                            <CardField icon={IconBuilding} value={lead.companyName} />
                            <CardField icon={IconMail} value={lead.email} />
                            <CardField icon={IconUserCircle} value={lead.assignedTo?.name} />
                        </div>
                    </article>
                ))}

                {data?.data.length === 0 && <p className="py-3 text-center text-light">No leads</p>}

                {data && data.pagination.total > COLUMN_LIMIT && (
                    <p className="py-1 text-center text-sm text-faint">
                        Showing {COLUMN_LIMIT} of {data.pagination.total}
                    </p>
                )}
            </div>
        </section>
    );
}

function CardField({ icon: Icon, value }: { icon: typeof IconMail; value?: string | null }) {
    return (
        <p className="flex h-5 items-center gap-1.5">
            <Icon size={14} className="shrink-0 text-faint" />
            <span className={`truncate ${value ? "" : "text-light"}`}>{value || "Empty"}</span>
        </p>
    );
}
