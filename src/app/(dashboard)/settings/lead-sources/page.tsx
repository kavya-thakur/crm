import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import LeadSourcesView from "./LeadSourcesView";

export const metadata: Metadata = {
    title: "Lead Sources",
};

export default async function LeadSourcesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "lead-sources:manage")) {
        redirect("/leads");
    }

    return <LeadSourcesView />;
}
