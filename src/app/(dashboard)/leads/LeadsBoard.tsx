"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { Board, BoardCard, BoardColumn, CardFields, ColumnTitle, useBoardColumn } from "@/components/Board";
import type { DataColumn } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { askLostReason } from "@/components/LostReasonPrompt";
import { refreshLeads, type Lead, type LeadFilters, type LeadStage } from "./shared";

interface LeadsBoardProps {
    filters: LeadFilters;
    /** the columns shown in the table view, which the cards show too (and edit in place) */
    columns: DataColumn<Lead>[];
    canMove: boolean;
    onOpen: (id: number) => void;
    onCreate?: () => void;
}

interface StagesResponse {
    ok: boolean;
    data: LeadStage[];
}

// One column per stage. Dragging a card to another column moves it there.
export default function LeadsBoard({ filters, columns, canMove, onOpen, onCreate }: LeadsBoardProps) {
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

    // filtered to some stages: just those columns
    const picked = filters.stageIds;
    const stages = picked ? stagesQuery.data.filter((stage) => picked.includes(stage.id)) : stagesQuery.data;

    if (stages.length === 0) {
        return <p className="p-4 text-sm text-faint">No lead stages configured yet.</p>;
    }

    // the stage is the column a card sits in, so the card doesn't repeat it
    const fields = columns.filter((column) => column.key !== "stage");

    return (
        <Board>
            {stages.map((stage, index) => (
                <StageColumn
                    key={stage.id}
                    stage={stage}
                    filters={filters}
                    fields={fields}
                    canMove={canMove}
                    onOpen={onOpen}
                    onAdd={index === 0 ? onCreate : undefined}
                />
            ))}
        </Board>
    );
}

function StageColumn({
    stage,
    filters,
    fields,
    canMove,
    onOpen,
    onAdd,
}: Omit<LeadsBoardProps, "columns" | "onCreate"> & { stage: LeadStage; fields: DataColumn<Lead>[]; onAdd?: () => void }) {
    const queryClient = useQueryClient();

    const column = useBoardColumn<Lead>(["leads", "board", { ...filters, stageId: stage.id }], "/leads", { ...filters, stageId: stage.id });

    const move = useMutation({
        mutationFn: ({ id, lostReason }: { id: number; lostReason?: string | null }) => api.put(`/leads/${id}`, { stageId: stage.id, lostReason }),
        onSuccess: () => {
            toast.success(`Lead moved to ${stage.name}`);
            refreshLeads(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const leads = column.items;

    return (
        <BoardColumn
            id={String(stage.id)}
            title={<ColumnTitle color={stage.color}>{stage.name}</ColumnTitle>}
            count={column.total}
            more={column.more}
            loading={column.loading}
            error={column.error}
            onRetry={column.retry}
            emptyText="No leads"
            onDropCard={
                canMove
                    ? async (id) => {
                          // dropping on a lost stage asks why first; closing the question leaves the card where it was
                          const answer = stage.isLost ? await askLostReason("lead") : {};
                          if (answer) move.mutate({ id, ...answer });
                      }
                    : undefined
            }
            onAdd={onAdd}
        >
            {leads.map((lead) => (
                <BoardCard key={lead.id} id={lead.id} columnId={String(stage.id)} draggable={canMove} onOpen={() => onOpen(lead.id)}>
                    <p className="flex items-center gap-2 font-medium text-ink">
                        <Avatar name={lead.name} size="md" />
                        <span className="truncate">{lead.name}</span>
                    </p>
                    <CardFields record={lead} columns={fields} />
                </BoardCard>
            ))}
        </BoardColumn>
    );
}
