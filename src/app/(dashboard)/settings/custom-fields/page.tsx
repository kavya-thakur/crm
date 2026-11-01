import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import CustomFieldsView from "./CustomFieldsView";

export const metadata: Metadata = {
    title: "Custom Fields",
};

export default async function CustomFieldsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "custom-fields:manage")) {
        redirect("/leads");
    }

    return <CustomFieldsView />;
}
