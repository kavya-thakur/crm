import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import EmailTemplatesView from "./EmailTemplatesView";

export const metadata: Metadata = {
    title: "Email templates",
};

export default async function EmailTemplatesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "email-templates:manage")) {
        redirect("/leads");
    }

    return <EmailTemplatesView />;
}
