"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { Avatar } from "@/components/Avatar";
import { Board, BoardCard, BoardColumn, CardFields, ColumnTitle } from "@/components/Board";
import type { DataColumn } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { refreshLeads, type Lead, type LeadFilters, type LeadStage, type Paginated } from "./shared";

// ponytail: each column shows its first 100 leads; add "load more" per column when that's not enough
const COLUMN_LIMIT = 100;

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

    const stages = filters.stageId === undefined ? stagesQuery.data : stagesQuery.data.filter((stage) => stage.id === filters.stageId);

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

    const leadsQuery = useQuery({
        queryKey: ["leads", "board", { ...filters, stageId: stage.id }],
        queryFn: () =>
            api.get<Paginated<Lead>>("/leads", { params: { ...filters, stageId: stage.id, limit: COLUMN_LIMIT } }).then((res) => res.data),
        placeholderData: keepPreviousData,
    });

    const move = useMutation({
        mutationFn: (id: number) => api.put(`/leads/${id}`, { stageId: stage.id }),
        onSuccess: () => {
            toast.success(`Lead moved to ${stage.name}`);
            refreshLeads(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const leads = leadsQuery.data?.data ?? [];

    return (
        <BoardColumn
            id={String(stage.id)}
            title={<ColumnTitle color={stage.color}>{stage.name}</ColumnTitle>}
            count={leadsQuery.data?.pagination.total}
            shown={leads.length}
            loading={leadsQuery.isPending}
            error={leadsQuery.error}
            onRetry={() => leadsQuery.refetch()}
            emptyText="No leads"
            onDropCard={canMove ? (id) => move.mutate(id) : undefined}
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
