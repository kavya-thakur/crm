import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import ContactsView from "./ContactsView";

export const metadata: Metadata = {
    title: "Contacts",
};

// Server part: works out what this user may do, so the UI only shows buttons that will work.
// The API still checks every request; this is only about not showing dead buttons.
export default async function ContactsPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const can = (permission: string) => hasPermission(user, permission);

    return (
        <ContactsView
            meId={user.id}
            can={{
                create: can("contact:create"),
                update: can("contact:update"),
                delete: can("contact:delete"),
                // handing contacts out is a manager action (same rule as /api/contacts/:id/assign)
                assign: can("contact:update") && can("contact:all"),
                seeAgents: can("user:read"),
                manageCustomFields: can("custom-fields:manage"),
            }}
        />
    );
}
