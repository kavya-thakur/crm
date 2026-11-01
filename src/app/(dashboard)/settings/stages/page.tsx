import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import StagesView from "./StagesView";

export const metadata: Metadata = {
    title: "Stages & sources",
};

export default async function StagesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    // each list has its own permission, so a user only sees the ones they can manage
    const show = {
        leadStages: hasPermission(user, "lead-stages:manage"),
        leadSources: hasPermission(user, "lead-sources:manage"),
        pipeline: hasPermission(user, "pipeline:manage"),
    };

    if (!show.leadStages && !show.leadSources && !show.pipeline) {
        redirect("/leads");
    }

    return <StagesView show={show} />;
}
