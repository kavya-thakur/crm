import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import ImportView from "./ImportView";

export const metadata: Metadata = {
    title: "Import leads",
};

// Importing creates leads, so it needs lead:create, the same as "New lead"
export default async function ImportLeadsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "lead:create")) {
        redirect("/leads");
    }

    // choosing who gets the leads is for people who can give leads to others (and see the team)
    return <ImportView canAssign={hasPermission(user, "lead:all") && hasPermission(user, "user:read")} />;
}
