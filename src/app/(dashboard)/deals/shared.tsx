import { StageBadge } from "@/components/StageBadge";

export interface Permissions {
    create: boolean;
    update: boolean;
    read: boolean;
    delete: boolean;
    assign: boolean;
    seeAgents: boolean;
    managePipeline: boolean;
    manageCustomFields: boolean;
}
import type { Deal as PrismaDeal, PipelineStage as PrismaPipelineStage } from "@/generated/prisma/client";
export interface DealUser {
    id: number;
    name: string;
    email: string;
}
export interface DealLead {
    id: number;
    name: string;
}
export type PipelineStage = PrismaPipelineStage;

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
    customFields: Record<string, unknown> | null;
};
export interface DealFilters {
    search: string;
    pipelineStageId?: number;
    assignedTo?: "me" | "unassigned" | number;
    createdFrom?: string; // "YYYY-MM-DD"
    createdTo?: string;
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
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(Number(amount));
}