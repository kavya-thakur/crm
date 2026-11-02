import type { QueryClient } from "@tanstack/react-query";
import { StageBadge } from "@/components/StageBadge";

// After any change: refetch every lead list/board ("leads"), the lead stage list,
// and the open lead panel ("lead")
export function refreshLeads(queryClient: QueryClient) {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["lead"] });
}

// A lead that looks like the same person as another (GET /api/leads/duplicates)
export interface SimilarLead {
    id: number;
    name: string;
    companyName: string | null;
    stage: { name: string; color: string };
    open: boolean;
    owner: string | null;
    matchedOn: "email" | "phone";
    canOpen: boolean;
}

// Admin-editable, mirroring Deal's PipelineStage — see /settings/stages
export interface LeadStage {
    id: number;
    name: string;
    order: number;
    color: string;
    isConverted: boolean;
    isLost: boolean;
}

// Admin-editable, picked (not typed) on the lead form — see /settings/stages
export interface LeadSource {
    id: number;
    name: string;
    order: number;
    color: string;
}

export interface Lead {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    sourceId: number | null;
    source: LeadSource | null;
    stageId: number;
    stage: LeadStage;
    // why it was lost, while it's in a lost stage
    lostReason: string | null;
    // in lists: another open lead for the same person (same phone or email), if there is one
    duplicates?: { count: number; name: string } | null;
    createdAt: string;
    updatedAt: string;
    assignedTo: { id: number; name: string; email: string } | null;
    contact: { id: number; name: string } | null;
    // who made it / changed it last; null for records from before this was tracked
    createdBy?: { id: number; name: string } | null;
    updatedBy?: { id: number; name: string } | null;
    customFields: Record<string, unknown> | null;
}

export interface Agent {
    id: number;
    name: string;
    email: string;
}

export interface Paginated<T> {
    data: T[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

// What the signed-in user may do; computed on the server in page.tsx
export interface Permissions {
    create: boolean;
    update: boolean;
    delete: boolean;
    assign: boolean;
    seeAgents: boolean;
    // converting creates a deal, so it needs lead:update AND deal:create
    convertToDeal: boolean;
    manageCustomFields: boolean;
    manageLeadStages: boolean;
    manageLeadSources: boolean;
    canLinkContact: boolean;
}

// The filters/sort the API understands (GET /api/leads)
export interface LeadFilters {
    search?: string;
    // several stages at once; the board shows just these columns
    stageIds?: number[];
    sourceId?: number;
    assignedTo?: string; // "me" | "unassigned" | agent id
    createdFrom?: string; // "YYYY-MM-DD"
    createdTo?: string;
    createdBy?: string; // "me" | agent id
    updatedBy?: string;
    updatedFrom?: string; // "YYYY-MM-DD"
    updatedTo?: string;
    // only open leads that share a phone or email with another open lead
    duplicates?: boolean;
    // values for fields marked "show in filter", keyed by CustomFieldDefinition.key
    customFields?: Record<string, unknown>;
    sortBy: "createdAt" | "updatedAt" | "name" | "source";
    sortOrder: "asc" | "desc";
}

export function StageLabel({ stage }: { stage: { name: string; color: string } }) {
    return <StageBadge name={stage.name} color={stage.color} />;
}
