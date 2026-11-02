import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import LeadFormsView from "./LeadFormsView";

export const metadata: Metadata = {
    title: "Web forms",
};

export default async function LeadFormsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "lead-forms:manage")) {
        redirect("/leads");
    }

    // the team list (for "Give leads to") needs user:read; without it the owner just shows by name
    return <LeadFormsView seeAgents={hasPermission(user, "user:read")} />;
}
