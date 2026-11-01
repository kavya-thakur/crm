"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCurrencyRupee, IconTargetArrow, IconUser, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { ErrorState } from "@/components/ErrorState";
import { InlineLoader, PageLoader } from "@/components/Loader";
import { toast } from "@/components/Toast";
import {
    StageLabel,
    formatDealAmount,
    refreshDeals,
    type Deal,
    type DealFilters,
    type Paginated,
    type PipelineStage,
} from "./shared";

const COLUMN_LIMIT = 100;

interface DealsBoardProps {
    filters: DealFilters;
    canMove: boolean;
    onOpen: (id: number) => void;
    onError: (message: string) => void;
}

interface StagesResponse {
    ok: boolean;
    data: PipelineStage[];
}

type DealsResponse = Paginated<Deal>;

export default function DealsBoard({ filters, canMove, onOpen, onError }: DealsBoardProps) {
    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () =>
            api.get<StagesResponse>("/pipeline-stages").then((response) => response.data.data),
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

    const stages = filters.pipelineStageId === undefined
        ? stagesQuery.data
        : stagesQuery.data.filter((stage) => stage.id === filters.pipelineStageId);

    if (stages.length === 0) {
        return <p className="p-4 text-sm text-faint">No pipeline stages configured yet.</p>;
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

interface BoardColumnProps {
    stage: PipelineStage;
    filters: DealFilters;
    canMove: boolean;
    onOpen: (id: number) => void;
    onError: (message: string) => void;
}

function BoardColumn({ stage, filters, canMove, onOpen, onError }: BoardColumnProps) {
    const queryClient = useQueryClient();
    const [dragOver, setDragOver] = useState(false);

    const dealsQuery = useQuery({
        queryKey: ["deals", "board", { ...filters, pipelineStageId: stage.id }],
        queryFn: async () => {
            const response = await api.get<DealsResponse>("/deals", {
                params: {
                    ...filters,
                    search: filters.search || undefined,
                    pipelineStageId: stage.id,
                    page: 1,
                    limit: COLUMN_LIMIT,
                },
            });
            return response.data;
        },
        placeholderData: keepPreviousData,
    });

    const moveDeal = useMutation({
        mutationFn: (dealId: number) => api.put(`/deals/${dealId}`, { pipelineStageId: stage.id }),
        onSuccess: () => {
            toast.success("Deal moved");
            void refreshDeals(queryClient);
        },
        onError: (error) => onError(errorMessage(error)),
    });

    function handleDrop(event: React.DragEvent<HTMLElement>) {
        setDragOver(false);
        const dealId = Number(event.dataTransfer.getData("deal-id"));
        const currentStageId = Number(event.dataTransfer.getData("pipeline-stage-id"));
        if (!dealId || !Number.isFinite(dealId) || currentStageId === stage.id || moveDeal.isPending) {
            return;
        }
        moveDeal.mutate(dealId);
    }

    const deals = dealsQuery.data?.data ?? [];

    return (
        <section
            onDragOver={(event) => {
                if (!canMove) return;
                event.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
            }}
            onDrop={handleDrop}
            className={`flex w-64 shrink-0 flex-col border-r border-line-light ${dragOver ? "bg-accent-faint" : ""}`}
        >
            <header className="flex h-10 shrink-0 items-center gap-2 px-2">
                <StageLabel stage={stage} />
                <span className="text-faint">{dealsQuery.data?.pagination.total ?? 0}</span>
            </header>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {dealsQuery.isPending && <InlineLoader label="Loading deals" />}
                {dealsQuery.isError && (
                    <ErrorState
                        variant="inline"
                        title="Couldn't load deals"
                        error={dealsQuery.error}
                        onRetry={() => dealsQuery.refetch()}
                        retrying={dealsQuery.isFetching}
                    />
                )}
                {dealsQuery.isSuccess && deals.length === 0 && (
                    <p className="py-3 text-center text-light">No deals</p>
                )}

                {deals.map((deal) => (
                    <article
                        key={deal.id}
                        draggable={canMove && !moveDeal.isPending}
                        onDragStart={(event) => {
                            event.dataTransfer.setData("deal-id", String(deal.id));
                            event.dataTransfer.setData("pipeline-stage-id", String(deal.pipelineStageId));
                            event.dataTransfer.effectAllowed = "move";
                        }}
                        onClick={() => onOpen(deal.id)}
                        className="cursor-pointer rounded-lg border border-line bg-surface p-2 hover:border-line-strong hover:shadow-light"
                    >
                        <p className="flex items-center gap-1.5 font-medium">
                            <IconTargetArrow size={14} className="shrink-0 text-accent" />
                            <span className="truncate">{deal.title}</span>
                        </p>

                        <div className="mt-2 space-y-1 text-muted">
                            <CardField icon={IconCurrencyRupee} value={formatDealAmount(deal.amount)} />
                            <CardField icon={IconUser} value={deal.lead?.name} />
                            <CardField icon={IconUserCircle} value={deal.assignedTo?.name} />
                        </div>

                        <p className="mt-2 text-xs text-faint">{deal.probability}% probability</p>
                    </article>
                ))}

                {dealsQuery.data && dealsQuery.data.pagination.total > COLUMN_LIMIT && (
                    <p className="py-1 text-center text-sm text-faint">
                        Showing {COLUMN_LIMIT} of {dealsQuery.data.pagination.total}
                    </p>
                )}
            </div>
        </section>
    );
}

function CardField({
    icon: Icon,
    value,
}: {
    icon: typeof IconUser;
    value?: string | null;
}) {
    return (
        <p className="flex h-5 items-center gap-1.5">
            <Icon size={14} className="shrink-0 text-faint" />
            <span className={`truncate ${value ? "" : "text-light"}`}>{value || "Empty"}</span>
        </p>
    );
}
