"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { Board, BoardCard, BoardColumn, CardFields, ColumnTitle, useBoardColumn } from "@/components/Board";
import type { DataColumn } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { askLostReason } from "@/components/LostReasonPrompt";
import { formatMoneyShort } from "@/lib/utils/format";
import { formatDealAmount, refreshDeals, type Deal, type DealFilters, type PipelineStage } from "./shared";

interface DealsBoardProps {
    filters: DealFilters;
    /** the columns shown in the table view, which the cards show too (and edit in place) */
    columns: DataColumn<Deal>[];
    canMove: boolean;
    onOpen: (id: number) => void;
    onCreate?: () => void;
}

// One column per pipeline stage, each with its deals' total. Dragging a card to another
// column moves the deal there.
export default function DealsBoard({ filters, columns, canMove, onOpen, onCreate }: DealsBoardProps) {
    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () => api.get<{ data: PipelineStage[] }>("/pipeline-stages").then((response) => response.data.data),
    });

    if (stagesQuery.isPending) {
        return <PageLoader label="Loading pipeline" variant="board" />;
    }
    if (stagesQuery.isError) {
        return (
            <ErrorState
                title="Couldn't load the pipeline"
                error={stagesQuery.error}
                onRetry={() => stagesQuery.refetch()}
                retrying={stagesQuery.isFetching}
            />
        );
    }

    // the pipeline on screen's stages (all of them while there's one pipeline); filtered to some stages, just those
    const picked = filters.pipelineStageIds;
    const stages = stagesQuery.data.filter(
        (stage) => (filters.pipelineId === undefined || stage.pipelineId === filters.pipelineId) && (!picked || picked.includes(stage.id)),
    );

    if (stages.length === 0) {
        return <p className="p-4 text-sm text-faint">No pipeline stages configured yet.</p>;
    }

    // the card shows the amount up top and sits in its stage's column, so neither repeats as a field
    const fields = columns.filter((column) => column.key !== "pipelineStage" && column.key !== "amount");

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
}: Omit<DealsBoardProps, "columns" | "onCreate"> & { stage: PipelineStage; fields: DataColumn<Deal>[]; onAdd?: () => void }) {
    const queryClient = useQueryClient();

    const column = useBoardColumn<Deal>(["deals", "board", { ...filters, pipelineStageId: stage.id }], "/deals", {
        ...filters,
        search: filters.search || undefined,
        pipelineStageId: stage.id,
    });

    const moveDeal = useMutation({
        mutationFn: ({ id, lostReason }: { id: number; lostReason?: string | null }) => api.put(`/deals/${id}`, { pipelineStageId: stage.id, lostReason }),
        onSuccess: () => {
            toast.success(`Deal moved to ${stage.name}`);
            void refreshDeals(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const deals = column.items;

    return (
        <BoardColumn
            id={String(stage.id)}
            title={<ColumnTitle color={stage.color}>{stage.name}</ColumnTitle>}
            count={column.total}
            // the whole column's value, added up by the server, not just the cards loaded so far
            aside={
                (column.total ?? 0) > 0 && (
                    <span className="ml-auto font-display text-sm font-medium text-muted tabular-nums">{formatMoneyShort(column.totalAmount ?? 0)}</span>
                )
            }
            more={column.more}
            loading={column.loading}
            error={column.error}
            onRetry={column.retry}
            emptyText="No deals"
            onDropCard={
                canMove
                    ? async (id) => {
                          if (moveDeal.isPending) return;
                          // dropping on a lost stage asks why first; closing the question leaves the card where it was
                          const answer = stage.isLost ? await askLostReason("deal") : {};
                          if (answer) moveDeal.mutate({ id, ...answer });
                      }
                    : undefined
            }
            onAdd={onAdd}
        >
            {deals.map((deal) => (
                <BoardCard key={deal.id} id={deal.id} columnId={String(stage.id)} draggable={canMove} onOpen={() => onOpen(deal.id)}>
                    <p className="line-clamp-2 font-medium text-ink">{deal.title}</p>
                    <p className="mt-1 font-display text-[17px] leading-6 font-semibold tracking-tight text-ink tabular-nums">{formatDealAmount(deal.amount)}</p>
                    <CardFields record={deal} columns={fields} />
                </BoardCard>
            ))}
        </BoardColumn>
    );
}
