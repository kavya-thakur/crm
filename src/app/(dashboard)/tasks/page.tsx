import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import TasksView from "./TasksView";

export const metadata: Metadata = {
    title: "Tasks",
};

// Everyone can see and add tasks, so there are no permission props — only whether the
// team list (for choosing who does a task) may be loaded, which /api/agents checks itself.
export default async function TasksPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return <TasksView seeAgents={hasPermission(user, "user:read")} />;
}
