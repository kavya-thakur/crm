"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

import { toast } from "@/components/Toast";
import { trackBulkJob, type BulkProgress } from "./BackgroundJobs";

// What to refetch when the server says a kind of record changed. The keys are the first
// part of the React Query keys the pages use (["leads", ...], ["lead", 12], ...); a change
// to leads also touches contacts (every lead has one), the dashboard, the notes feed...
const REFRESH: Record<string, string[]> = {
    // converting or merging a lead creates or moves deals, so deals refresh too
    leads: ["leads", "lead", "lead-duplicates", "deals", "deal", "contacts", "contact", "notes-feed", "dashboard", "search", "my-day", "recycle-bin", "companies", "company"],
    deals: ["deals", "deal", "lead", "notes-feed", "dashboard", "search", "my-day", "recycle-bin", "companies", "company"],
    contacts: ["contacts", "contact", "lead", "notes-feed", "search", "recycle-bin", "companies", "company"],
    // a company renamed or deleted: the contacts that show its name too
    companies: ["companies", "company", "contact"],
    // something put back: it reappears in its list, with its tasks and calls
    "recycle-bin": ["recycle-bin", "leads", "lead", "deals", "deal", "contacts", "contact", "notes-feed", "dashboard", "search", "my-day", "tasks", "activities"],
    tasks: ["tasks", "task", "lead", "deal", "contact", "dashboard", "my-day"],
    activities: ["activities", "activity", "lead", "deal", "contact", "dashboard", "my-day"],
    "lead-stages": ["leadStage", "leads", "lead", "dashboard", "my-day"],
    "lead-sources": ["leadSource", "leads", "lead", "dashboard"],
    "pipeline-stages": ["pipelineStage", "deals", "deal", "dashboard"],
    "custom-fields": ["customFields", "leads", "deals", "contacts"],
    // a new integration can add a lead source of its name
    "lead-forms": ["leadForms", "leadSource"],
    // sent, failed, opened: the Emails tab, and the timeline entry on the lead or deal
    emails: ["emails", "lead", "deal"],
    "email-templates": ["emailTemplates"],
    products: ["products"],
    // a rule changed, or ran (its run count and log)
    automations: ["automations"],
    agents: ["agents", "dashboard"],
    roles: ["roles", "permissions"],
    // read in another of your tabs (sent only to you)
    notifications: ["notifications"],
    imports: ["imports"],
};

// Changes to these can change what the signed-in person may see (their role, the
// sidebar), which the server renders, so the page itself is refreshed too
// "billing": a site admin switched Pro on (or extended the trial), so a locked app opens up
const RERENDER = new Set(["roles", "agents", "billing"]);

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
            // back after losing the connection (sleep, wifi): anything could have changed meanwhile,
            // so every list and the page itself (kept for 30 s, next.config.ts) are fetched again
            if (connectedBefore) {
                void queryClient.invalidateQueries();
                router.refresh();
            }
            connectedBefore = true;
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
        };
    }, [queryClient, router]);

    return null;
}
