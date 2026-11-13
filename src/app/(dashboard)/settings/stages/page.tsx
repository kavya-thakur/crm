import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import StagesView from "./StagesView";

export const metadata: Metadata = {
    title: "Lead stages & sources",
};

export default async function StagesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    // each list has its own permission, so a user only sees the ones they can manage.
    // Deal pipelines and their stages have their own page: /settings/pipelines
    const show = {
        leadStages: hasPermission(user, "lead-stages:manage"),
        leadSources: hasPermission(user, "lead-sources:manage"),
    };

    if (!show.leadStages && !show.leadSources) {
        redirect(hasPermission(user, "pipeline:manage") ? "/settings/pipelines" : "/leads");
    }

    return <StagesView show={show} />;
}
