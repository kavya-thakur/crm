import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import MembersView from "./MembersView";
import { isDemoWorkspace } from "@/lib/demo/workspace";

export const metadata: Metadata = {
    title: "Members",
};

export default async function MembersPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "user:read")) {
        redirect("/leads");
    }

    return (
        <MembersView
            me={{
                id: user.id,
                isOwner: user.isOwner,
                // the owner always can; others only if the owner allowed them (and not while logged in as someone)
                canLogInAs: !user.actingAsId && !isDemoWorkspace(user) && (user.isOwner || user.canLogInAs),
                permissions: user.role.permissions.map(({ permission }) => permission.name),
            }}
            can={{
                create: hasPermission(user, "user:create"),
                update: hasPermission(user, "user:update"),
                delete: hasPermission(user, "user:delete"),
                // picking a role needs the role list
                seeRoles: hasPermission(user, "role:read"),
            }}
        />
    );
}
