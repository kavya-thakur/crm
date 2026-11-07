import type { QueryClient } from "@tanstack/react-query";

// After any change: refetch every contact list and the open contact panel
export function refreshContacts(queryClient: QueryClient) {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    queryClient.invalidateQueries({ queryKey: ["contact"] });
}

export interface Contact {
    id: number;
    name: string;
    email: string | null;
    phone: string;
    jobTitle: string | null;
    description: string | null;
    // where they work (the Companies page)
    company?: { id: number; name: string } | null;
    createdAt: string;
    updatedAt: string;
    assignedTo: { id: number; name: string; email: string } | null;
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
    manageCustomFields: boolean;
}

// The filters/sort the API understands (GET /api/contacts)
export interface ContactFilters {
    search?: string;
    assignedTo?: string; // "me" | "unassigned" | agent id
    createdFrom?: string; // "YYYY-MM-DD"
    createdTo?: string;
    createdBy?: string; // "me" | agent id
    updatedBy?: string;
    updatedFrom?: string; // "YYYY-MM-DD"
    updatedTo?: string;
    // values for fields marked "show in filter", keyed by CustomFieldDefinition.key
    customFields?: Record<string, unknown>;
    sortBy: "name" | "email" | "createdAt" | "updatedAt";
    sortOrder: "asc" | "desc";
}
