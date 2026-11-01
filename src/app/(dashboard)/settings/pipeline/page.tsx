import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import PipelineStagesView from "./PipelineStagesView";

export const metadata: Metadata = {
    title: "Pipeline",
};

export default async function PipelinePage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "pipeline:manage")) {
        redirect("/leads");
    }

    return <PipelineStagesView />;
}
