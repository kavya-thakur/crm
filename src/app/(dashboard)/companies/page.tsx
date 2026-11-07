import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import CompaniesView from "./CompaniesView";

export const metadata: Metadata = {
    title: "Companies",
};

// Companies go with contacts: the same permissions see and change them
export default async function CompaniesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "contact:read")) {
        redirect("/leads");
    }

    const can = (permission: string) => hasPermission(user, permission);

    return <CompaniesView can={{ create: can("contact:create"), update: can("contact:update"), delete: can("contact:delete") }} />;
}
