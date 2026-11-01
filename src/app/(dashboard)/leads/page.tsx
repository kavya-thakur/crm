import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import LeadsView from "./LeadsView";

export const metadata: Metadata = {
    title: "Leads",
};

// Server part: works out what this user may do, so the UI only shows buttons that will work.
// The API still checks every request; this is only about not showing dead buttons.
export default async function LeadsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const can = (permission: string) => hasPermission(user, permission);

    return (
        <LeadsView
            meId={user.id}
            can={{
                create: can("lead:create"),
                update: can("lead:update"),
                delete: can("lead:delete"),
                // handing leads out is a manager action (same rule as /api/leads/:id/assign)
                assign: can("lead:update") && can("lead:all"),
                seeAgents: can("user:read"),
                // same rule as POST /api/leads/:id/convert
                convertToDeal: can("lead:update") && can("deal:create"),
                manageCustomFields: can("custom-fields:manage"),
                manageLeadStages: can("lead-stages:manage"),
                manageLeadSources: can("lead-sources:manage"),
                // lets the New Lead form search existing contacts to link instead of always creating one
                canLinkContact: can("contact:read"),
            }}
        />
    );
}
