import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { isTestPayment, periodOf, receiptFor, receiptNumber } from "@/lib/billing/receipts";
import { createOrgWithUser, cleanupOrg } from "../helpers";

// Receipts: the right numbers on them, and only the people who should see one
describe("receipts", () => {
    const organizationIds: number[] = [];
    afterEach(async () => {
        vi.unstubAllEnvs();
        for (const id of organizationIds.splice(0)) await cleanupOrg(id);
    });

    async function workspace() {
        const { organization, user } = await createOrgWithUser([]);
        organizationIds.push(organization.id);
        const owner = await prisma.user.update({ where: { id: user.id }, data: { isOwner: true } });
        const teammate = await prisma.user.create({ data: { organizationId: organization.id, roleId: user.roleId, name: "Rep", email: `rep-${organization.id}@example.com`, passwordHash: "x" } });
        const pay = (amount: number) =>
            prisma.payment.create({ data: { organizationId: organization.id, paidBy: owner.email, cycle: "MONTHLY", amount, paidUntil: new Date("2026-12-12T00:00:00Z") } });
        return { owner, teammate, pay };
    }

    it("numbers it, and covers the plan's period up to when Pro ran until", () => {
        expect(receiptNumber(123)).toBe("FL-000123");
        const { from, to } = periodOf({ cycle: "MONTHLY", paidUntil: new Date("2026-12-12T00:00:00Z") });
        expect(to.toISOString()).toBe("2026-12-12T00:00:00.000Z");
        expect(from.toISOString()).toBe("2026-11-12T00:00:00.000Z");
    });

    it("shows it to the workspace's owner and site admins, never to a teammate or another workspace", async () => {
        const acme = await workspace();
        const other = await workspace();
        const paid = await acme.pay(149_900);
        const free = await acme.pay(0);

        expect(await receiptFor(paid.id, acme.owner)).toMatchObject({ id: paid.id, organization: { name: expect.any(String) } });
        expect(await receiptFor(paid.id, acme.teammate)).toBeNull();
        expect(await receiptFor(paid.id, other.owner)).toBeNull();
        // a free month has nothing to show
        expect(await receiptFor(free.id, acme.owner)).toBeNull();

        vi.stubEnv("SITE_ADMIN_EMAILS", other.owner.email);
        expect(await receiptFor(paid.id, other.owner)).not.toBeNull();
    });

    it("marks online payments made with Razorpay's test keys", () => {
        vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc");
        expect(isTestPayment({ method: "RAZORPAY" })).toBe(true);
        expect(isTestPayment({ method: "MANUAL" })).toBe(false);
        vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_abc");
        expect(isTestPayment({ method: "RAZORPAY" })).toBe(false);
    });
});
