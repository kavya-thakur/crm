import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IconLogout } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { Avatar } from "@/components/Avatar";
import CommandMenu, { SearchButton, type MenuPage, type SearchKind } from "./CommandMenu";
import SidebarNav, { type NavGroup } from "./SidebarNav";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
    // The proxy only checks that a cookie exists; this verifies it
    const user = await getCurrentUser();

    if (!user) {
        redirect("/login");
    }

    const canSeeMembers = hasPermission(user, "user:read");
    const canSeeRoles = hasPermission(user, "role:read");
    const canSeePipeline = hasPermission(user, "pipeline:manage");
    const canSeeLeadStages = hasPermission(user, "lead-stages:manage");
    const canSeeLeadSources = hasPermission(user, "lead-sources:manage");
    const canSeeCustomFields = hasPermission(user, "custom-fields:manage");
    const canSeeNotes = hasPermission(user, "lead:read") || hasPermission(user, "deal:read") || hasPermission(user, "contact:read");

    // What this person can open: the workspace pages, and the settings pages grouped the
    // way twenty.com groups them. The sidebar shows these, and so does search's "Go to".
    const workspace: NavGroup = {
        label: "Workspace",
        pages: [
            { href: "/dashboard", label: "Dashboard", section: "dashboard" },
            { href: "/leads", label: "Leads", section: "leads" },
            { href: "/deals", label: "Deals", section: "deals" },
            { href: "/contacts", label: "Contacts", section: "contacts" },
            { href: "/activities", label: "Activities", section: "activities" },
            { href: "/tasks", label: "Tasks", section: "tasks" },
            ...(canSeeNotes ? [{ href: "/notes", label: "Notes", section: "notes" as const }] : []),
        ],
    };
    const workspaceSettings: MenuPage[] = [
        ...(canSeeMembers ? [{ href: "/settings/members", label: "Members", section: "members" as const }] : []),
        ...(canSeeRoles ? [{ href: "/settings/roles", label: "Roles", section: "roles" as const }] : []),
        ...(canSeePipeline || canSeeLeadStages || canSeeLeadSources
            ? [{ href: "/settings/stages", label: "Stages & sources", section: "stages" as const }]
            : []),
        ...(canSeeCustomFields ? [{ href: "/settings/custom-fields", label: "Custom fields", section: "customFields" as const }] : []),
    ];
    const settings: NavGroup[] = [
        // everyone has their own profile, so Settings always has somewhere to land
        { label: "User", pages: [{ href: "/settings/profile", label: "Profile", section: "profile" }] },
        ...(workspaceSettings.length > 0 ? [{ label: "Workspace", pages: workspaceSettings }] : []),
    ];

    // What search can look through: leads, deals and contacts need their read permission;
    // everyone has their own tasks and calls/meetings
    const searchKinds: SearchKind[] = [
        ...(hasPermission(user, "lead:read") ? ["lead" as const] : []),
        ...(hasPermission(user, "deal:read") ? ["deal" as const] : []),
        ...(hasPermission(user, "contact:read") ? ["contact" as const] : []),
        "task",
        "activity",
    ];

    // Server Action: runs on the server when the form below is submitted
    async function logout() {
        "use server";
        (await cookies()).delete("access_token");
        redirect("/login");
    }

    return (
        <div className="flex h-screen bg-shell">
            {/* Sidebar sits on the grey app background, like Twenty's */}
            <aside className="flex w-55 shrink-0 flex-col gap-4 px-2 py-3">
                <div className="flex h-7 items-center gap-2 px-1 font-medium">
                    <span className="flex size-4 items-center justify-center rounded bg-ink text-[10px] font-semibold text-white">
                        {user.organization.name[0].toUpperCase()}
                    </span>
                    <span className="truncate">{user.organization.name}</span>
                </div>

                <SearchButton />

                <SidebarNav workspace={workspace} settings={settings} />

                <div className="mt-auto flex items-center gap-1 px-1">
                    <Link href="/settings/profile" className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-fill">
                        <Avatar name={user.name} size="md" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{user.name}</p>
                            <p className="truncate text-sm text-faint">{user.email}</p>
                        </div>
                    </Link>
                    <form action={logout}>
                        <button
                            aria-label="Log out"
                            title="Log out"
                            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink"
                        >
                            <IconLogout size={16} />
                        </button>
                    </form>
                </div>
            </aside>

            {/* The white page card, lifted off the grey background by a soft shadow */}
            <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/5 bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_28px_-10px_rgb(0_0_0/0.14)]">
                {children}
            </main>

            <CommandMenu pages={[...workspace.pages, ...settings.flatMap((group) => group.pages)]} kinds={searchKinds} />
        </div>
    );
}
