import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import RolesView from "./RolesView";

export const metadata: Metadata = {
    title: "Roles",
};

export default async function RolesPage() {
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    if (!hasPermission(user, "role:read")) {
        redirect("/leads");
    }

    return (
        <RolesView
            me={{
                roleId: user.roleId,
                permissions: user.role.permissions.map(({ permission }) => permission.name),
            }}
            can={{
                create: hasPermission(user, "role:create"),
                update: hasPermission(user, "role:update"),
                delete: hasPermission(user, "role:delete"),
            }}
        />
    );
}
