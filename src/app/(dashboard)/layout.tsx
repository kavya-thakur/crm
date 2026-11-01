import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IconLogout } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { Avatar } from "@/components/Avatar";
import { SectionIcon } from "@/components/SectionIcon";
import NavLink from "./NavLink";

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

    // Server Action: runs on the server when the form below is submitted
    async function logout() {
        "use server";
        (await cookies()).delete("access_token");
        redirect("/login");
    }

    return (
        <div className="flex h-screen">
            {/* Sidebar sits on the grey app background, like Twenty's */}
            <aside className="flex w-55 shrink-0 flex-col gap-4 px-2 py-3">
                <div className="flex h-7 items-center gap-2 px-1 font-medium">
                    <span className="flex size-4 items-center justify-center rounded bg-ink text-[10px] font-semibold text-white">
                        {user.organization.name[0].toUpperCase()}
                    </span>
                    <span className="truncate">{user.organization.name}</span>
                </div>

                <nav className="flex flex-col gap-0.5">
                    <p className="flex h-7 items-center px-1 text-xs font-semibold text-light">Workspace</p>
                    <NavLink href="/leads">
                        <SectionIcon section="leads" />
                        Leads
                    </NavLink>
                    <NavLink href="/deals">
                        <SectionIcon section="deals" />
                        Deals
                    </NavLink>
                    <NavLink href="/contacts">
                        <SectionIcon section="contacts" />
                        Contacts
                    </NavLink>
                    <NavLink href="/activities">
                        <SectionIcon section="activities" />
                        Activities
                    </NavLink>
                    <NavLink href="/tasks">
                        <SectionIcon section="tasks" />
                        Tasks
                    </NavLink>
                    {canSeeNotes && (
                        <NavLink href="/notes">
                            <SectionIcon section="notes" />
                            Notes
                        </NavLink>
                    )}
                </nav>

                {/* always shown: everyone has their own profile */}
                <nav className="flex flex-col gap-0.5">
                    <p className="flex h-7 items-center px-1 text-xs font-semibold text-light">Settings</p>
                    <NavLink href="/settings/profile">
                        <SectionIcon section="profile" />
                        Profile
                    </NavLink>
                    {canSeeMembers && (
                        <NavLink href="/settings/members">
                            <SectionIcon section="members" />
                            Members
                        </NavLink>
                    )}
                    {canSeeRoles && (
                        <NavLink href="/settings/roles">
                            <SectionIcon section="roles" />
                            Roles
                        </NavLink>
                    )}
                    {(canSeePipeline || canSeeLeadStages || canSeeLeadSources) && (
                        <NavLink href="/settings/stages">
                            <SectionIcon section="stages" />
                            Stages & sources
                        </NavLink>
                    )}
                    {canSeeCustomFields && (
                        <NavLink href="/settings/custom-fields">
                            <SectionIcon section="customFields" />
                            Custom Fields
                        </NavLink>
                    )}
                </nav>

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

            {/* The white page card */}
            <main className="my-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface">
                {children}
            </main>
        </div>
    );
}
