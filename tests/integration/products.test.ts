import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { quoteTotals } from "@/lib/deals/quote";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listProducts, POST as createProduct } from "@/app/api/products/route";
import { PUT as updateProduct } from "@/app/api/products/[id]/route";
import { POST as addLine } from "@/app/api/deals/[id]/products/route";
import { DELETE as removeLine, PUT as updateLine } from "@/app/api/deals/[id]/products/[lineId]/route";
import { DELETE as deleteDeal, GET as getDeal } from "@/app/api/deals/[id]/route";
import { GET as listBin } from "@/app/api/recycle-bin/route";
import { POST as restore } from "@/app/api/recycle-bin/[id]/route";
import { GET as listActivities } from "@/app/api/activities/route";

const send = (method: string, body?: object) =>
    new NextRequest("http://localhost", { method, headers: { "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) }) });
const ids = (id: number, lineId?: number) => ({ params: Promise.resolve({ id: String(id), lineId: String(lineId) }) });
const amountOf = async (dealId: number) => Number((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).amount);

describe("quote totals", () => {
    it("takes the discount off before the tax goes on", () => {
        // 2 × 1,000 = 2,000, less 10% = 1,800, plus 18% GST = 2,124; and 500 with no tax
        expect(
            quoteTotals([
                { price: "1000", quantity: 2, discountPercent: 10, taxPercent: 18 },
                { price: 500, quantity: 1, discountPercent: 0, taxPercent: 0 },
            ]),
        ).toEqual({ gross: 2500, discount: 200, net: 2300, tax: 324, total: 2624 });
    });
});

describe("products", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp(permissions = ["workspace:manage", "deal:read", "deal:update", "deal:delete", "deal:all"]) {
        const { organization, user } = await createOrgWithUser(permissions);
        organizationId = organization.id;
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId };
        const stage = await prisma.pipelineStage.create({ data: { ...org, name: "Proposal" } });
        const deal = await prisma.deal.create({ data: { ...org, title: "Acme rollout", amount: 99, pipelineStageId: stage.id } });
        return { user, org, deal };
    }

    it("builds a deal's quote from the catalogue, and keeps the deal's amount equal to its total", async () => {
        const { deal } = await setUp();
        const created = await createProduct(send("POST", { name: "annual licence", price: 1000, taxPercent: 18 }));
        expect(created.status).toBe(201);
        const product = (await created.json()).data;
        expect(product.name).toBe("Annual licence");

        // copied onto the deal: 2 × 1,000 + 18% = 2,360
        expect((await addLine(send("POST", { productId: product.id, quantity: 2 }), ids(deal.id))).status).toBe(201);
        expect(await amountOf(deal.id)).toBe(2360);

        // a one-off line, then a discount on the first
        await addLine(send("POST", { name: "Setup", price: 500 }), ids(deal.id));
        const [licence] = await prisma.dealProduct.findMany({ where: { dealId: deal.id }, orderBy: { id: "asc" } });
        expect((await updateLine(send("PUT", { discountPercent: 10 }), ids(deal.id, licence.id))).status).toBe(200);
        expect(await amountOf(deal.id)).toBe(2624);

        // a new catalogue price doesn't change the line already on the deal
        await updateProduct(send("PUT", { price: 2000 }), ids(product.id));
        const { data } = await (await getDeal(send("GET"), ids(deal.id))).json();
        expect(data.products.map((line: { name: string; price: string }) => [line.name, Number(line.price)])).toEqual([
            ["Annual licence", 1000],
            ["Setup", 500],
        ]);

        // the last line gone: the amount stays where it was, to be typed in again
        await removeLine(send("DELETE"), ids(deal.id, licence.id));
        expect(await amountOf(deal.id)).toBe(500);
    });

    it("lets only workspace admins change the catalogue, and only touches deals this person can see", async () => {
        const { org } = await setUp(["deal:read", "deal:update"]);
        expect((await createProduct(send("POST", { name: "Licence", price: 10 }))).status).toBe(403);
        expect((await listProducts()).status).toBe(200);

        // someone else's deal (no deal:all): not found
        const stage = await prisma.pipelineStage.findFirstOrThrow({ where: org });
        const theirs = await prisma.deal.create({ data: { ...org, title: "Not mine", pipelineStageId: stage.id } });
        expect((await addLine(send("POST", { name: "Setup", price: 500 }), ids(theirs.id))).status).toBe(404);
    });

    it("keeps a deleted deal's lines in the recycle bin, and puts them back", async () => {
        const { deal } = await setUp();
        await addLine(send("POST", { name: "Setup", price: 500, quantity: 3 }), ids(deal.id));

        await deleteDeal(send("DELETE"), ids(deal.id));
        expect(await prisma.dealProduct.count({ where: { dealId: deal.id } })).toBe(0);

        const [item] = (await (await listBin(new NextRequest("http://localhost/api/recycle-bin"))).json()).data;
        expect((await restore(send("POST"), ids(item.id))).status).toBe(200);
        const lines = await prisma.dealProduct.findMany({ where: { dealId: deal.id } });
        expect(lines.map((line) => [line.name, line.quantity])).toEqual([["Setup", 3]]);
        expect(await amountOf(deal.id)).toBe(1500);
    });
});

describe("activities calendar", () => {
    it("gives every call and meeting in a date range, not one page of them", async () => {
        const { organization, user } = await createOrgWithUser([]);
        (getCurrentUser as Mock).mockResolvedValue(user);
        const org = { organizationId: organization.id };
        const day = (date: number) => new Date(Date.UTC(2026, 10, date, 10));
        await prisma.scheduledActivity.createMany({
            data: [1, 2, 3, 30].map((date) => ({ ...org, type: "CALL" as const, title: `Call ${date}`, scheduledAt: day(date), assignedToId: user.id, createdById: user.id })),
        });

        const url = `http://localhost/api/activities?scope=all&limit=1&from=${day(1).toISOString()}&to=${day(4).toISOString()}`;
        const { data } = await (await listActivities(new NextRequest(url))).json();
        expect(data.map((activity: { title: string }) => activity.title).sort()).toEqual(["Call 1", "Call 2", "Call 3"]);
        await cleanupOrg(organization.id);
    });
});
