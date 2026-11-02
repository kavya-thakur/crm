"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

import { api } from "@/lib/api/client";
import { toast } from "@/components/Toast";
import { trackBulkJob, type BulkProgress } from "./BackgroundJobs";

// What to refetch when the server says a kind of record changed. The keys are the first
// part of the React Query keys the pages use (["leads", ...], ["lead", 12], ...); a change
// to leads also touches contacts (every lead has one), the dashboard, the notes feed...
const REFRESH: Record<string, string[]> = {
    // converting or merging a lead creates or moves deals, so deals refresh too
    leads: ["leads", "lead", "lead-duplicates", "deals", "deal", "contacts", "contact", "notes-feed", "dashboard", "search"],
    deals: ["deals", "deal", "lead", "notes-feed", "dashboard", "search"],
    contacts: ["contacts", "contact", "lead", "notes-feed", "search"],
    tasks: ["tasks", "task", "lead", "deal", "contact", "dashboard"],
    activities: ["activities", "activity", "lead", "deal", "contact", "dashboard"],
    "lead-stages": ["leadStage", "leads", "lead", "dashboard"],
    "lead-sources": ["leadSource", "leads", "lead", "dashboard"],
    "pipeline-stages": ["pipelineStage", "deals", "deal", "dashboard"],
    "custom-fields": ["customFields", "leads", "deals", "contacts"],
    "lead-forms": ["leadForms"],
    agents: ["agents", "dashboard"],
    roles: ["roles", "permissions"],
    // read in another of your tabs (sent only to you)
    notifications: ["notifications"],
    imports: ["imports"],
};

// Changes to these can change what the signed-in person may see (their role, the
// sidebar), which the server renders, so the page itself is refreshed too
const RERENDER = new Set(["roles", "agents"]);

interface PushedNotification {
    type: string;
    title: string;
    body: string | null;
}

/**
 * The browser's half of real time (docs/REALTIME.md): one Socket.IO connection per tab,
 * opened once signed in. The login cookie goes with it, so the server knows who this is.
 *  - "changed" { topic }: someone else changed some records, so refetch what's on screen
 *  - "notification": something for this person, so update the bell and show a toast
 *  - "import-progress": how far one of this person's CSV imports has got (the import page shows it)
 *  - "bulk-progress": how far one of their big bulk actions has got (the corner card shows it)
 * Renders nothing; it's mounted once in the dashboard layout.
 */
export function LiveUpdates() {
    const queryClient = useQueryClient();
    const router = useRouter();

    useEffect(() => {
        // same origin as the page, at /socket.io (where server.ts attached it)
        const socket = io({ withCredentials: true });
        let connectedBefore = false;

        socket.on("connect", () => {
            // the API is told which tab made a change, so this tab isn't told about its own changes
            api.defaults.headers.common["X-Socket-Id"] = socket.id;

            // back after losing the connection (sleep, wifi): anything could have changed meanwhile
            if (connectedBefore) void queryClient.invalidateQueries();
            connectedBefore = true;
        });

        socket.on("disconnect", () => {
            delete api.defaults.headers.common["X-Socket-Id"];
        });

        socket.on("changed", ({ topic }: { topic: string }) => {
            for (const key of REFRESH[topic] ?? []) void queryClient.invalidateQueries({ queryKey: [key] });
            if (RERENDER.has(topic)) router.refresh();
        });

        socket.on("notification", (notification: PushedNotification) => {
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
            // a reminder stays up longer than a plain "you were assigned"
            const show = notification.type === "REMINDER" ? toast.warning : toast.info;
            show(notification.title, notification.body ?? undefined);
        });

        // the worker's progress goes straight into the import page's data, so its bar moves live
        socket.on("import-progress", (progress: { id: number }) => {
            queryClient.setQueryData(["import", progress.id], (current: object | undefined) => (current ? { ...current, ...progress } : current));
            void queryClient.invalidateQueries({ queryKey: ["imports"] });
        });

        // big bulk actions: their corner card follows along (see trackBulkJob)
        socket.on("bulk-progress", (progress: BulkProgress) => trackBulkJob(queryClient, progress));

        return () => {
            socket.disconnect();
            delete api.defaults.headers.common["X-Socket-Id"];
        };
    }, [queryClient, router]);

    return null;
}
