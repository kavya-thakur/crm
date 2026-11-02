import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import DashboardView from "./DashboardView";

export const metadata: Metadata = {
    title: "Dashboard",
};

// Everyone has a dashboard; /api/dashboard leaves out what they aren't allowed to see
export default async function DashboardPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    return <DashboardView firstName={user.name.split(" ")[0]} userId={user.id} />;
}
