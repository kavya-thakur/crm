"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, errorMessage } from "@/lib/api/client";
import { Board, BoardCard, BoardColumn, CardFields, ColumnTitle } from "@/components/Board";
import type { DataColumn } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import { formatMoneyShort } from "@/lib/format";
import { formatDealAmount, refreshDeals, type Deal, type DealFilters, type Paginated, type PipelineStage } from "./shared";

const COLUMN_LIMIT = 100;

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

    const stages =
        filters.pipelineStageId === undefined ? stagesQuery.data : stagesQuery.data.filter((stage) => stage.id === filters.pipelineStageId);

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

    const dealsQuery = useQuery({
        queryKey: ["deals", "board", { ...filters, pipelineStageId: stage.id }],
        queryFn: () =>
            api
                .get<Paginated<Deal>>("/deals", {
                    params: { ...filters, search: filters.search || undefined, pipelineStageId: stage.id, page: 1, limit: COLUMN_LIMIT },
                })
                .then((response) => response.data),
        placeholderData: keepPreviousData,
    });

    const moveDeal = useMutation({
        mutationFn: (dealId: number) => api.put(`/deals/${dealId}`, { pipelineStageId: stage.id }),
        onSuccess: () => {
            toast.success(`Deal moved to ${stage.name}`);
            void refreshDeals(queryClient);
        },
        onError: (error) => toast.error(errorMessage(error)),
    });

    const deals = dealsQuery.data?.data ?? [];
    const total = deals.reduce((sum, deal) => sum + Number(deal.amount), 0);
    // past the column limit the sum only covers what's loaded, so it's marked as "at least"
    const partial = (dealsQuery.data?.pagination.total ?? 0) > deals.length;

    return (
        <BoardColumn
            id={String(stage.id)}
            title={<ColumnTitle color={stage.color}>{stage.name}</ColumnTitle>}
            count={dealsQuery.data?.pagination.total}
            aside={deals.length > 0 && <span className="ml-auto font-display text-sm font-medium text-muted tabular-nums">{partial ? "≥ " : ""}{formatMoneyShort(total)}</span>}
            shown={deals.length}
            loading={dealsQuery.isPending}
            error={dealsQuery.error}
            onRetry={() => dealsQuery.refetch()}
            emptyText="No deals"
            onDropCard={canMove ? (id) => !moveDeal.isPending && moveDeal.mutate(id) : undefined}
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
