import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { sendBillingReminders } from "@/lib/billing/reminders";
import { createOrgWithUser, cleanupOrg } from "../helpers";

// the app's mailbox: catch what would be sent
vi.mock("@/lib/emails/system", async (original) => ({ ...(await original<object>()), sendSystemEmail: vi.fn(async () => true) }));
import { sendSystemEmail } from "@/lib/emails/system";

const DAY = 24 * 60 * 60 * 1000;

describe("billing reminders", () => {
    let organizationId = 0;
    afterEach(async () => {
        (sendSystemEmail as Mock).mockClear();
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function workspace(billing: { plan?: string; trialEndsAt?: Date; paidUntil?: Date }) {
        const { organization, user } = await createOrgWithUser([]);
        organizationId = organization.id;
        await prisma.user.update({ where: { id: user.id }, data: { isOwner: true } });
        await prisma.organization.update({ where: { id: organization.id }, data: billing });
        return user;
    }
    // what the owner was told, in the bell
    const told = (userId: number) => prisma.notification.findMany({ where: { userId, type: "BILLING" }, orderBy: { id: "asc" } }).then((rows) => rows.map((row) => row.title));
    const ends = new Date(Date.now() + 2.5 * DAY);

    it("tells the owner as the trial runs out, each reminder once, and when it has ended", async () => {
        const owner = await workspace({ trialEndsAt: ends });

        await sendBillingReminders();
        await sendBillingReminders();
        expect(await told(owner.id)).toEqual(["Your free trial ends in 3 days"]);
        expect((sendSystemEmail as Mock).mock.calls[0][0]).toMatchObject({ to: owner.email, subject: "Your free trial ends in 3 days" });

        await sendBillingReminders(new Date(ends.getTime() - 0.5 * DAY));
        await sendBillingReminders(new Date(ends.getTime() + 0.5 * DAY));
        expect(await told(owner.id)).toEqual(["Your free trial ends in 3 days", "Your free trial ends tomorrow", "Your free trial has ended"]);
        expect(sendSystemEmail).toHaveBeenCalledTimes(3);
    });

    it("reminds a week before Pro ends, and starts over once it's renewed", async () => {
        const owner = await workspace({ plan: "PRO", paidUntil: new Date(Date.now() + 5.5 * DAY) });

        await sendBillingReminders();
        expect(await told(owner.id)).toEqual(["Your Pro plan ends in 6 days"]);

        // renewed: a new end date, and its own reminders later; nothing now
        await prisma.organization.update({ where: { id: organizationId }, data: { paidUntil: new Date(Date.now() + 370 * DAY) } });
        await sendBillingReminders();
        expect(await told(owner.id)).toHaveLength(1);
    });

    it("leaves a workspace with plenty of time alone", async () => {
        const owner = await workspace({ trialEndsAt: new Date(Date.now() + 6 * DAY) });
        await sendBillingReminders();
        expect(await told(owner.id)).toEqual([]);
    });
});
