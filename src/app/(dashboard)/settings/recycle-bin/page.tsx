import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import RecycleBinView from "./RecycleBinView";

export const metadata: Metadata = {
    title: "Recycle bin",
};

// For anyone who can delete leads, deals or contacts: they see what they're allowed to restore
export default async function RecycleBinPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!["lead:delete", "deal:delete", "contact:delete"].some((permission) => hasPermission(user, permission))) {
        redirect("/leads");
    }

    return <RecycleBinView />;
}
