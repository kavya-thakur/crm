import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IconAddressBook, IconCalendarEvent, IconChecklist, IconCurrencyRupee, IconLogout, IconNotes, IconShieldLock, IconSettings, IconStack2, IconTag, IconTargetArrow, IconUsers } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
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
                        {/* tinted icon tile: Twenty colours each object's icon */}
                        <span className="flex size-4 items-center justify-center rounded border border-[#d2deff] bg-accent-soft text-accent-hover">
                            <IconTargetArrow size={12} />
                        </span>
                        Leads
                    </NavLink>
                    <NavLink href="/deals">
                        {/* tinted icon tile: Twenty colours each object's icon */}
                        <span className="flex size-4 items-center justify-center rounded border border-[#d2deff] bg-accent-soft text-accent-hover">
                            <IconCurrencyRupee size={12} />
                        </span>
                        Deals
                    </NavLink>
                    <NavLink href="/contacts">
                        {/* tinted icon tile: Twenty colours each object's icon */}
                        <span className="flex size-4 items-center justify-center rounded border border-[#d2deff] bg-accent-soft text-accent-hover">
                            <IconAddressBook size={12} />
                        </span>
                        Contacts
                    </NavLink>
                    <NavLink href="/activities">
                        <span className="flex size-4 items-center justify-center rounded border border-[#d2deff] bg-accent-soft text-accent-hover">
                            <IconCalendarEvent size={12} />
                        </span>
                        Activities
                    </NavLink>
                    <NavLink href="/tasks">
                        <span className="flex size-4 items-center justify-center rounded border border-[#d2deff] bg-accent-soft text-accent-hover">
                            <IconChecklist size={12} />
                        </span>
                        Tasks
                    </NavLink>
                    {canSeeNotes && (
                        <NavLink href="/notes">
                            <span className="flex size-4 items-center justify-center rounded border border-[#d2deff] bg-accent-soft text-accent-hover">
                                <IconNotes size={12} />
                            </span>
                            Notes
                        </NavLink>
                    )}
                </nav>

                {(canSeeMembers || canSeeRoles || canSeePipeline || canSeeLeadStages || canSeeLeadSources || canSeeCustomFields) && (
                    <nav className="flex flex-col gap-0.5">
                        <p className="flex h-7 items-center px-1 text-xs font-semibold text-light">Settings</p>
                        {canSeeMembers && (
                            <NavLink href="/settings/members">
                                {/* grey tile: Twenty's colour for system objects */}
                                <span className="flex size-4 items-center justify-center rounded border border-line-strong bg-app text-[#838383]">
                                    <IconUsers size={12} />
                                </span>
                                Members
                            </NavLink>
                        )}
                        {canSeeRoles && (
                            <NavLink href="/settings/roles">
                                <span className="flex size-4 items-center justify-center rounded border border-line-strong bg-app text-[#838383]">
                                    <IconShieldLock size={12} />
                                </span>
                                Roles
                            </NavLink>
                        )}
                        {canSeePipeline && (
                            <NavLink href="/settings/pipeline">
                                <span className="flex size-4 items-center justify-center rounded border border-line-strong bg-app text-[#838383]">
                                    <IconStack2 size={12} />
                                </span>
                                Pipeline
                            </NavLink>
                        )}
                        {canSeeLeadStages && (
                            <NavLink href="/settings/lead-stages">
                                <span className="flex size-4 items-center justify-center rounded border border-line-strong bg-app text-[#838383]">
                                    <IconStack2 size={12} />
                                </span>
                                Lead Stages
                            </NavLink>
                        )}
                        {canSeeLeadSources && (
                            <NavLink href="/settings/lead-sources">
                                <span className="flex size-4 items-center justify-center rounded border border-line-strong bg-app text-[#838383]">
                                    <IconTag size={12} />
                                </span>
                                Lead Sources
                            </NavLink>
                        )}
                        {canSeeCustomFields && (
                            <NavLink href="/settings/custom-fields">
                                <span className="flex size-4 items-center justify-center rounded border border-line-strong bg-app text-[#838383]">
                                    <IconSettings size={12} />
                                </span>
                                Custom Fields
                            </NavLink>
                        )}
                    </nav>
                )}

                <div className="mt-auto flex items-center gap-2 px-1">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent">
                        {user.name[0].toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{user.name}</p>
                        <p className="truncate text-sm text-faint">{user.email}</p>
                    </div>
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
