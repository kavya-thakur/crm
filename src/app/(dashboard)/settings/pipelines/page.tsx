import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import PipelinesView from "./PipelinesView";

export const metadata: Metadata = {
    title: "Pipelines",
};

export default async function PipelinesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }
    if (!hasPermission(user, "pipeline:manage")) {
        redirect("/deals");
    }

    return <PipelinesView />;
}
