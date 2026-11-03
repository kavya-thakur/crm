import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IconLogout } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { hasPermission } from "@/lib/auth/requirePermission";
import { Avatar } from "@/components/Avatar";
import { LostReasonPrompt } from "@/components/LostReasonPrompt";
import { DEMO_PEOPLE, isDemoWorkspace } from "@/lib/demo/workspace";
import { LiveUpdates } from "./LiveUpdates";
import { ActivityAlert } from "./ActivityAlert";
import { SidebarShell } from "./SidebarShell";
import { BackgroundJobs } from "./BackgroundJobs";
import { NotificationBell } from "./NotificationBell";
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
    const canSeeLeadForms = hasPermission(user, "lead-forms:manage");
    const canSeeEmailTemplates = hasPermission(user, "email-templates:manage");
    const canSeeAutomations = hasPermission(user, "automations:manage");
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
        ...(canSeeLeadForms ? [{ href: "/settings/lead-forms", label: "Web forms", section: "leadForms" as const }] : []),
        ...(canSeeLeadForms ? [{ href: "/settings/integrations", label: "Lead integrations", section: "integrations" as const }] : []),
        ...(canSeeEmailTemplates ? [{ href: "/settings/email-templates", label: "Email templates", section: "emailTemplates" as const }] : []),
        ...(canSeeAutomations ? [{ href: "/settings/automations", label: "Automations", section: "automations" as const }] : []),
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
        // a column on phones (the menu bar on top), a row from tablets up (the sidebar on the left)
        <div className="flex h-dvh flex-col bg-shell md:flex-row">
            {/* Sidebar sits on the grey app background, like Twenty's */}
            <SidebarShell title={user.organization.name}>
                <div className="flex h-7 items-center gap-2 px-1 font-medium">
                    <span className="flex size-4 items-center justify-center rounded bg-ink text-[10px] font-semibold text-white">
                        {user.organization.name[0].toUpperCase()}
                    </span>
                    <span className="truncate">{user.organization.name}</span>
                    <NotificationBell />
                </div>

                <SearchButton />

                <SidebarNav workspace={workspace} settings={settings} />

                {/* In the demo workspace: who you're exploring as, and that it all resets */}
                {isDemoWorkspace(user) && (
                    <div className="mt-auto rounded-lg border border-accent/20 bg-accent-faint p-2.5 text-sm">
                        <p className="font-medium text-ink">Demo workspace</p>
                        <p className="mt-0.5 text-muted">
                            You&apos;re exploring as a {user.email === DEMO_PEOPLE.manager.email ? "manager" : "sales agent"}. Anything you change resets every night.
                        </p>
                        {/* an API route that signs in again, so a plain link */}
                        <a
                            href={`/api/auth/demo?as=${user.email === DEMO_PEOPLE.manager.email ? "agent" : "manager"}`}
                            className="mt-2 block font-medium text-accent hover:underline"
                        >
                            Switch to the {user.email === DEMO_PEOPLE.manager.email ? "sales agent" : "manager"} view
                        </a>
                        <Link href="/register" className="mt-1 block font-medium text-accent hover:underline">
                            Create your own workspace →
                        </Link>
                    </div>
                )}

                <div className={`${isDemoWorkspace(user) ? "" : "mt-auto "}flex items-center gap-1 px-1`}>
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
            </SidebarShell>

            {/* The white page card, lifted off the grey background by a soft shadow */}
            <main className="mx-2 mb-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:my-2 md:ml-0 rounded-xl border border-black/5 bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_28px_-10px_rgb(0_0_0/0.14)]">
                {children}
            </main>

            <CommandMenu pages={[...workspace.pages, ...settings.flatMap((group) => group.pages)]} kinds={searchKinds} />
            <LostReasonPrompt />
            {/* the live connection: other people's changes and notifications arrive here */}
            <LiveUpdates />
            <BackgroundJobs />
            {/* the popup when one of your calls or meetings starts, on any page */}
            <ActivityAlert />
        </div>
    );
}
