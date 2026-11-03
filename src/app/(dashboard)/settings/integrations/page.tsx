import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import IntegrationsView from "./IntegrationsView";

export const metadata: Metadata = {
    title: "Lead integrations",
};

export default async function IntegrationsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "lead-forms:manage")) {
        redirect("/leads");
    }

    // the team list (for "Give leads to") needs user:read; without it the owner just shows by name
    return <IntegrationsView seeAgents={hasPermission(user, "user:read")} />;
}
