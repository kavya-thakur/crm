import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/realtime/notify";
import { escapeHtml, sendSystemEmail } from "@/lib/emails/system";
import { accessOf } from "./plans";

/*
 * "Your trial ends in 3 days" / "Your Pro plan ends in 7 days" / "...has ended": to the workspace
 * owner, in the bell and by email (Flash's own mailbox, when it's set up), so the lock is never a
 * surprise. Checked every hour by the server (startRealtime). Each reminder goes once: the
 * workspace keeps the last one sent (billingReminderKey), and a new trial end or paid period
 * starts a fresh set.
 */

// days before the end when a reminder goes; 0 is "it has ended"
const STEPS = { trial: [3, 1], pro: [7, 1] } as const;
const DAY = 24 * 60 * 60 * 1000;
const DEMO_SLUG = "flash-demo";

export async function sendBillingReminders(now = new Date()) {
    try {
        const soon = (days: number) => ({ gt: new Date(now.getTime() - 2 * DAY), lt: new Date(now.getTime() + days * DAY) });
        const workspaces = await prisma.organization.findMany({
            where: {
                slug: { not: DEMO_SLUG },
                // ending in the next few days, or ended in the last two
                OR: [{ plan: { not: "PRO" }, trialEndsAt: soon(STEPS.trial[0]) }, { plan: "PRO", paidUntil: soon(STEPS.pro[0]) }],
            },
            select: {
                id: true,
                name: true,
                plan: true,
                trialEndsAt: true,
                paidUntil: true,
                billingReminderKey: true,
                users: { where: { isOwner: true }, select: { id: true, name: true, email: true }, take: 1 },
            },
        });

        for (const workspace of workspaces) {
            const access = accessOf(workspace, now);
            const kind = workspace.plan === "PRO" ? "pro" : "trial";
            // the closest step not passed yet: 5 days left is the 7-day reminder, 1 day left the 1-day one
            const step = access.state === "ended" ? 0 : [...STEPS[kind]].reverse().find((days) => access.daysLeft <= days);
            const owner = workspace.users[0];
            if (step === undefined || !owner || !access.endsAt) continue;

            const key = `${kind}:${access.endsAt.toISOString().slice(0, 10)}:${step}`;
            if (key === workspace.billingReminderKey) continue;
            // claimed first, so two servers (or two runs overlapping) never send it twice
            const { count } = await prisma.organization.updateMany({ where: { id: workspace.id, billingReminderKey: workspace.billingReminderKey }, data: { billingReminderKey: key } });
            if (count === 0) continue;

            await remind(workspace, owner, kind, step === 0 ? 0 : access.daysLeft);
        }
    } catch (error) {
        console.error("Billing reminders:", error);
    }
}

async function remind(workspace: { id: number; name: string }, owner: { id: number; name: string; email: string }, kind: "trial" | "pro", daysLeft: number) {
    const what = kind === "trial" ? "free trial" : "Pro plan";
    const when = daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
    const title = daysLeft === 0 ? `Your ${what} has ended` : `Your ${what} ends ${when}`;
    const body =
        daysLeft === 0
            ? `${workspace.name} is locked until you choose a plan. Your data is safe: nothing has been deleted.`
            : kind === "trial"
              ? `Choose a plan to keep ${workspace.name} running without a break. Your data stays safe either way.`
              : `Renew to keep ${workspace.name} running without a break. Paying early adds on to your current period.`;

    await notify([owner.id], { organizationId: workspace.id, actorId: null, type: "BILLING", title, body, link: "/settings/billing" });

    // the email needs the site's real address; never a localhost link to a customer
    const site = process.env.APP_URL?.replace(/\/$/, "") ?? (process.env.NODE_ENV === "production" ? null : "http://localhost:3000");
    if (!site) return console.error("Billing reminder: APP_URL isn't set, so only the in-app notification was sent");
    const link = `${site}/settings/billing`;
    const firstName = owner.name.split(" ")[0];
    await sendSystemEmail({
        to: owner.email,
        subject: title,
        text: `Hi ${firstName},\n\n${body}\n\n${daysLeft === 0 ? "Choose a plan" : kind === "trial" ? "Choose a plan" : "Renew"}: ${link}\n\nFlash`,
        html: `<p>Hi ${escapeHtml(firstName)},</p><p>${escapeHtml(body)}</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1c1c1c;color:#ffffff;text-decoration:none;font-weight:600">${kind === "pro" && daysLeft > 0 ? "Renew" : "Choose a plan"}</a></p>`,
    }).catch((error) => console.error("Billing reminder email:", error));
}
