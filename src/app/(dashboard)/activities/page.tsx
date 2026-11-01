import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import ActivitiesView from "./ActivitiesView";

export const metadata: Metadata = {
    title: "Activities",
};

// Everyone can see and book activities, so there are no permission props — only whether the
// team list (for assigning and tagging agents) may be loaded, which /api/agents checks itself.
export default async function ActivitiesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return <ActivitiesView seeAgents={hasPermission(user, "user:read")} />;
}
