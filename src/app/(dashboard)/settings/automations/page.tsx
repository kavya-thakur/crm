import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import AutomationsView from "./AutomationsView";

export const metadata: Metadata = {
    title: "Automations",
};

export default async function AutomationsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "automations:manage")) {
        redirect("/leads");
    }

    return <AutomationsView />;
}
