import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { isDemoWorkspace } from "@/lib/demo/workspace";
import WorkspaceView from "./WorkspaceView";

export const metadata: Metadata = {
    title: "Workspace",
};

export default async function WorkspacePage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "workspace:manage")) {
        redirect("/leads");
    }

    return <WorkspaceView name={user.organization.name} currency={user.organization.currency} demo={isDemoWorkspace(user)} />;
}
