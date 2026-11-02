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
};
export interface DealFilters {
    search: string;
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
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        // "₹3,20,000", with paise only when there are any
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(amount));
}