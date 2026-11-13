import { redirect } from "next/navigation";
import Link from "next/link";
import { IconLogout } from "@tabler/icons-react";

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { isSiteAdmin } from "@/lib/auth/siteAdmin";
import { billingSummary, lockedFor } from "@/lib/billing/gate";
import { accessOf } from "@/lib/billing/plans";
import { LogoMark } from "@/components/Logo";
import BillingView, { BillingAddress } from "./settings/billing/BillingView";
import { prisma } from "@/lib/db/prisma";
import { hasPermission } from "@/lib/auth/requirePermission";
import { Avatar } from "@/components/Avatar";
import { LostReasonPrompt } from "@/components/LostReasonPrompt";
import { isDemoWorkspace } from "@/lib/demo/workspace";
import { LiveUpdates } from "./LiveUpdates";
import { WorkspaceCurrency } from "./WorkspaceCurrency";
import { ActivityAlert } from "./ActivityAlert";
import { LoggedInAsBar } from "./LoggedInAsBar";
import { LogoutButton } from "./LogoutButton";
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
    // just signed up: name the workspace first (a site admin "logged in as" them skips it)
    if (user.needsOnboarding && !user.actingAsId) {
        redirect("/onboarding");
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
    const canSeeWorkspace = hasPermission(user, "workspace:manage");
    const canSeeBin = ["lead:delete", "deal:delete", "contact:delete"].some((permission) => hasPermission(user, permission));
    const canSeeNotes = hasPermission(user, "lead:read") || hasPermission(user, "deal:read") || hasPermission(user, "contact:read");

    // What this person can open: the workspace pages, and the settings pages grouped the
    // way twenty.com groups them. The sidebar shows these, and so does search's "Go to".
    const workspace: NavGroup = {
        label: "Workspace",
        pages: [
            { href: "/my-day", label: "My day", section: "myDay" },
            { href: "/dashboard", label: "Dashboard", section: "dashboard" },
            { href: "/leads", label: "Leads", section: "leads" },
            { href: "/deals", label: "Deals", section: "deals" },
            { href: "/contacts", label: "Contacts", section: "contacts" },
            ...(hasPermission(user, "contact:read") ? [{ href: "/companies", label: "Companies", section: "companies" as const }] : []),
            { href: "/activities", label: "Activities", section: "activities" },
            { href: "/tasks", label: "Tasks", section: "tasks" },
            ...(canSeeNotes ? [{ href: "/notes", label: "Notes", section: "notes" as const }] : []),
        ],
    };
    const workspaceSettings: MenuPage[] = [
        ...(canSeeWorkspace ? [{ href: "/settings/workspace", label: "Workspace", section: "workspace" as const }] : []),
        ...(canSeeWorkspace ? [{ href: "/settings/products", label: "Products", section: "products" as const }] : []),
        // everyone sees where the workspace stands; only the owner chooses a plan there
        ...(!isDemoWorkspace(user) ? [{ href: "/settings/billing", label: "Billing", section: "billing" as const }] : []),
        ...(canSeeMembers ? [{ href: "/settings/members", label: "Members", section: "members" as const }] : []),
        ...(canSeeRoles ? [{ href: "/settings/roles", label: "Roles", section: "roles" as const }] : []),
        ...(canSeePipeline ? [{ href: "/settings/pipelines", label: "Pipelines", section: "pipelines" as const }] : []),
        ...(canSeeLeadStages || canSeeLeadSources ? [{ href: "/settings/stages", label: "Lead stages & sources", section: "stages" as const }] : []),
        ...(canSeeCustomFields ? [{ href: "/settings/custom-fields", label: "Custom fields", section: "customFields" as const }] : []),
        ...(canSeeLeadForms ? [{ href: "/settings/lead-forms", label: "Web forms", section: "leadForms" as const }] : []),
        ...(canSeeLeadForms ? [{ href: "/settings/integrations", label: "Lead integrations", section: "integrations" as const }] : []),
        ...(canSeeEmailTemplates ? [{ href: "/settings/email-templates", label: "Email templates", section: "emailTemplates" as const }] : []),
        ...(canSeeAutomations ? [{ href: "/settings/automations", label: "Automations", section: "automations" as const }] : []),
        ...(canSeeBin ? [{ href: "/settings/recycle-bin", label: "Recycle bin", section: "recycleBin" as const }] : []),
    ];
    const settings: NavGroup[] = [
        // everyone has their own profile, so Settings always has somewhere to land
        { label: "User", pages: [{ href: "/settings/profile", label: "Profile", section: "profile" }] },
        ...(workspaceSettings.length > 0 ? [{ label: "Workspace", pages: workspaceSettings }] : []),
        // the people who run the website: every workspace and user (not while logged in as someone)
        ...(!user.actingAsId && isSiteAdmin(user) ? [{ label: "Site admin", pages: [{ href: "/settings/site-admin", label: "Users & workspaces", section: "siteAdmin" as const }] }] : []),
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

    // While logged in as a teammate: who you really are (the bar on top has the way back)
    const realPerson = user.actingAsId ? await prisma.user.findUnique({ where: { id: user.actingAsId }, select: { name: true } }) : null;

    // The trial (or paid period) has ended: Billing, and nothing else, on every page until Pro is
    // on. The API is closed too (src/lib/billing/gate.ts). Nothing is deleted.
    if (await lockedFor(user)) {
        return (
            <div className="flex h-dvh flex-col bg-shell">
                <header className="flex h-14 shrink-0 items-center gap-2 px-4">
                    <LogoMark size={22} />
                    <span className="truncate font-semibold">{user.organization.name}</span>
                    <span className="ml-auto truncate text-sm text-faint">{user.email}</span>
                    <LogoutButton className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted hover:bg-fill hover:text-ink">
                        <IconLogout size={16} /> <span className="hidden sm:inline">Log out</span>
                    </LogoutButton>
                </header>
                <main className="mx-2 mb-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-black/5 bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_28px_-10px_rgb(0_0_0/0.14)]">
                    <BillingView billing={await billingSummary(user)} locked />
                </main>
                <BillingAddress />
                {/* Pro switched on by a site admin: the page re-renders, and the app is back */}
                <LiveUpdates />
            </div>
        );
    }
    // the sidebar's reminder: the trial's days left, or Pro's in its last week
    const access = isDemoWorkspace(user) ? null : accessOf(user.organization);
    const reminder = access && (access.state === "trial" || (access.state === "pro" && access.daysLeft <= 7)) ? access : null;

    return (
        <div className="flex h-dvh flex-col">
            {realPerson && <LoggedInAsBar name={user.name} realName={realPerson.name} />}
            {/* a column on phones (the menu bar on top), a row from tablets up (the sidebar on the left) */}
            <div className="flex min-h-0 flex-1 flex-col bg-shell md:flex-row">
                <WorkspaceCurrency code={user.organization.currency} />
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

                    {/* On the free trial: how long is left, and where to choose a plan */}
                    {reminder && (
                        <Link href="/settings/billing" className="mt-auto rounded-lg border border-line bg-surface p-2.5 text-sm hover:border-line-strong">
                            <p className="font-medium text-ink">
                                {reminder.state === "trial" ? "Free trial" : "Pro"} · {reminder.daysLeft} {reminder.daysLeft === 1 ? "day" : "days"} left
                            </p>
                            <p className="mt-0.5 font-medium text-accent">{reminder.state === "trial" ? "Choose a plan →" : "Renew →"}</p>
                        </Link>
                    )}

                    {/* In the demo workspace: who you're exploring as, and that it all resets */}
                    {isDemoWorkspace(user) && (
                        <div className="mt-auto rounded-lg border border-accent/20 bg-accent-faint p-2.5 text-sm">
                            <p className="font-medium text-ink">Demo workspace</p>
                            <p className="mt-0.5 text-muted">
                                You&apos;re exploring as John Doe, the manager. Anything you change resets every night.
                            </p>
                            <Link href="/register" className="mt-2 block font-medium text-accent hover:underline">
                                Create your own workspace →
                            </Link>
                        </div>
                    )}

                    <div className={`${isDemoWorkspace(user) || reminder ? "" : "mt-auto "}flex items-center gap-1 px-1`}>
                        <Link href="/settings/profile" className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-fill">
                            <Avatar name={user.name} size="md" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{user.name}</p>
                                <p className="truncate text-sm text-faint">{user.email}</p>
                            </div>
                        </Link>
                        <LogoutButton label="Log out" className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-fill hover:text-ink">
                            <IconLogout size={16} />
                        </LogoutButton>
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
        </div>
    );
}
