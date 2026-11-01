import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import LeadStagesView from "./LeadStagesView";

export const metadata: Metadata = {
    title: "Lead Stages",
};

export default async function LeadStagesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "lead-stages:manage")) {
        redirect("/leads");
    }

    return <LeadStagesView />;
}
