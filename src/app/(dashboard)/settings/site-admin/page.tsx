import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { isRootAdmin, isSiteAdmin } from "@/lib/auth/siteAdmin";
import SiteAdminView from "./SiteAdminView";

export const metadata: Metadata = {
    title: "Site admin",
};

// Only for the people who run the website (see src/lib/auth/siteAdmin.ts)
export default async function SiteAdminPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (user.actingAsId || !isSiteAdmin(user)) {
        redirect("/leads");
    }

    return <SiteAdminView meId={user.id} root={isRootAdmin(user)} />;
}
