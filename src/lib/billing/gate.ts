import type { IncomingMessage } from "node:http";

import { prisma } from "@/lib/db/prisma";
import { isSiteAdmin } from "@/lib/auth/siteAdmin";
import { signedIn } from "@/lib/auth/jwt";
import type { Prisma } from "@/generated/prisma/client";
import { razorpayConfigured } from "./razorpay";
import { accessOf, paidUntilAfter, type BillingCycle } from "./plans";

/*
 * The lock when a workspace's trial or paid period has ended. Pages: the dashboard layout shows
 * Billing instead of the app (lockedFor). The API: the custom server refuses requests with 402
 * before they reach a route (apiLocked), so it's one check for every route, not one per route.
 * Never locked: the demo workspace, and site admins (themselves, or logged in as a customer).
 */

const DEMO_SLUG = "flash-demo";

// What stays open while locked: signing in and out, Billing itself, site admin, the health check,
// and web forms and integrations (leads keep coming in, so nothing is lost)
const OPEN_PATHS = ["/api/auth/", "/api/billing", "/api/site-admin", "/api/health", "/api/public/"];

// Workspaces known to be open, until their trial or paid period ends. A lock only starts at that
// moment, so this never lets a locked one through; locked ones are looked up every time, so
// switching Pro on unlocks at once.
const openUntil = new Map<number, number>();

export async function workspaceLocked(organizationId: number) {
    if ((openUntil.get(organizationId) ?? 0) > Date.now()) return false;

    const workspace = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { slug: true, plan: true, trialEndsAt: true, paidUntil: true },
    });
    if (!workspace) return false;
    if (workspace.slug === DEMO_SLUG) {
        openUntil.set(organizationId, Infinity);
        return false;
    }

    const access = accessOf(workspace);
    if (access.state === "ended") return true;
    openUntil.set(organizationId, access.endsAt!.getTime());
    return false;
}

async function isSiteAdminById(userId: number) {
    const person = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isSiteAdmin: true } });
    return !!person && isSiteAdmin(person);
}

/** For the custom server, before an API request reaches its route: true = refuse it (402). */
export async function apiLocked(req: IncomingMessage) {
    const path = req.url ?? "";
    if (!path.startsWith("/api/") || OPEN_PATHS.some((open) => path.startsWith(open))) return false;

    // not signed in: the route itself answers 401
    const session = signedIn(req.headers.cookie);
    if (!session || !(await workspaceLocked(session.organizationId))) return false;

    return !(await isSiteAdminById(session.actingAs ?? session.userId));
}

/** For the pages: is the app locked for this person (the layout shows Billing instead)? */
export async function lockedFor(user: { id: number; actingAsId: number | null; email: string; isSiteAdmin: boolean; organization: { slug: string; plan: string; trialEndsAt: Date; paidUntil: Date | null } }) {
    if (user.organization.slug === DEMO_SLUG || accessOf(user.organization).state !== "ended") return false;
    return !(user.actingAsId ? await isSiteAdminById(user.actingAsId) : isSiteAdmin(user));
}

// What the Billing page (and the lock screen) shows for this person's workspace
export async function billingSummary(user: { isOwner: boolean; actingAsId: number | null; organization: { id: number; name: string; plan: string; trialEndsAt: Date; paidUntil: Date | null; billingCycle: string | null; planRequest: string | null } }) {
    const org = user.organization;
    const access = accessOf(org);
    const owner = await prisma.user.findFirst({ where: { organizationId: org.id, isOwner: true }, select: { name: true, email: true } });
    return {
        workspaceName: org.name,
        state: access.state,
        endsAt: access.endsAt?.toISOString() ?? null,
        daysLeft: access.daysLeft,
        wasPro: access.wasPro,
        billingCycle: org.billingCycle,
        planRequest: org.planRequest,
        // choosing a plan is the owner's, themselves (not someone logged in as them)
        canChoose: user.isOwner && !user.actingAsId,
        // pay online (Razorpay), or ask for Pro and pay another way
        payOnline: razorpayConfigured(),
        owner,
    };
}

export type BillingSummary = Awaited<ReturnType<typeof billingSummary>>;

/**
 * Switches Pro on for a month or a year: after an online payment, or by a site admin who took the
 * payment another way. A renewal adds on to a period still running, and buying during the free
 * trial adds on to the trial's days left. Pass a transaction to make it
 * part of one (the payment's record and this, together).
 */
export async function activatePro(organizationId: number, cycle: BillingCycle, db: Pick<Prisma.TransactionClient, "organization"> = prisma) {
    const workspace = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true, paidUntil: true, trialEndsAt: true } });
    // it starts when what's running now ends: a paid period, or the free trial (buying on day 2 of
    // the trial doesn't throw away the 5 days left)
    const paidUntil = paidUntilAfter(cycle, workspace.plan === "PRO" ? workspace.paidUntil : workspace.trialEndsAt);
    await db.organization.update({
        where: { id: organizationId },
        data: { plan: "PRO", billingCycle: cycle, paidUntil, planRequest: null, planRequestedAt: null },
    });
    return paidUntil;
}
