import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { formatMoneyExact } from "@/lib/utils/format";
import { StageBadge } from "@/components/StageBadge";

export interface Permissions {
    create: boolean;
    update: boolean;
    read: boolean;
    delete: boolean;
    assign: boolean;
    seeAgents: boolean;
    readLeads: boolean;
    managePipeline: boolean;
    manageCustomFields: boolean;
    // the product catalogue in Settings
    manageProducts: boolean;
}
import type { Deal as PrismaDeal, PipelineStage as PrismaPipelineStage } from "@/generated/prisma/client";
export interface DealUser {
    id: number;
    name: string;
    email: string;
}
// The lead a deal came from: the person, and how to reach them
export interface DealLead {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
}
export type PipelineStage = PrismaPipelineStage;

// A deals board with its own stages ("New sales", "Renewals"). Every workspace has at least one,
// and every pipeline control in the app only shows once there are two or more.
export interface Pipeline {
    id: number;
    name: string;
    order: number;
    stages: PipelineStage[];
    // from the list only (not after adding or renaming one): how many deals are in it
    dealCount?: number;
}

// The workspace's pipelines in order, each with its stages in board order
export function usePipelines(enabled = true) {
    return useQuery({
        queryKey: ["pipelines"],
        queryFn: () => api.get<{ data: Pipeline[] }>("/pipelines").then((res) => res.data.data),
        enabled,
    });
}

// "Renewals · Contacted" once there's more than one pipeline, so two "Won" stages can be told apart;
// just "Contacted" while there's one
export function stageName(stage: { name: string; pipelineId: number }, pipelines: Pipeline[] | undefined) {
    const pipeline = pipelines && pipelines.length > 1 ? pipelines.find((item) => item.id === stage.pipelineId) : undefined;
    return pipeline ? `${pipeline.name} · ${stage.name}` : stage.name;
}

export function StageLabel({ stage }: { stage: { name: string; color: string } }) {
    return <StageBadge name={stage.name} color={stage.color} />;
}

export type Deal = Omit<
    PrismaDeal,
    "amount" | "expectedCloseDate" | "createdAt" | "updatedAt" | "customFields"
> & {
    amount: number | string;
    expectedCloseDate: string | null;
    createdAt: string;
    updatedAt: string;
    lead: DealLead | null;
    assignedTo: DealUser | null;
    pipelineStage: PipelineStage;
    // who made it / changed it last; null for records from before this was tracked
    createdBy?: { id: number; name: string } | null;
    updatedBy?: { id: number; name: string } | null;
    customFields: Record<string, unknown> | null;
    // the lines of its quote (the open deal's own query has them, lists don't)
    products?: DealLine[];
};

// One line of a deal's quote; the price is a Decimal, so it arrives as a string
export interface DealLine {
    id: number;
    productId: number | null;
    name: string;
    price: string | number;
    quantity: number;
    discountPercent: number;
    taxPercent: number;
}

// A product in the catalogue (Settings > Products)
export interface Product {
    id: number;
    name: string;
    price: string | number;
    taxPercent: number;
    description: string | null;
}
export interface DealFilters {
    search: string;
    // the pipeline whose deals are shown; only set once there are two or more
    pipelineId?: number;
    // several stages at once; the board shows just these columns
    pipelineStageIds?: number[];
    assignedTo?: "me" | "unassigned" | number;
    createdFrom?: string; // "YYYY-MM-DD"
    createdTo?: string;
    createdBy?: string; // "me" | agent id
    updatedBy?: string;
    updatedFrom?: string; // "YYYY-MM-DD"
    updatedTo?: string;
    // values for fields marked "show in filter", keyed by CustomFieldDefinition.key
    customFields?: Record<string, unknown>;
    sortBy: "title" | "amount" | "expectedCloseDate" | "createdAt" | "updatedAt";
    sortOrder: "asc" | "desc";
}
export interface Paginated<T> {
    ok: boolean;
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export function refreshDeals(queryClient: {
    invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
}) {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deals"] }),
        queryClient.invalidateQueries({ queryKey: ["deal"] }),
    ]);
}
export function formatDealAmount(amount: number | string) {
    return formatMoneyExact(Number(amount));
}