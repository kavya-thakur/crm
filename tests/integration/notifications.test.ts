import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { sendReminders } from "@/lib/realtime/socketServer";
import { createOrgWithUser, createLeadStage, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as getBell, PATCH as markRead } from "@/app/api/notifications/route";
import { POST as assignLead } from "@/app/api/leads/[id]/assign/route";
import { POST as addLeadNote } from "@/app/api/leads/[id]/notes/route";
import { POST as createActivity } from "@/app/api/activities/route";
import { PUT as updateActivity } from "@/app/api/activities/[id]/route";

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const json = (method: string, body: object) =>
    new NextRequest("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000);

describe("notifications", () => {
    let organizationId = 0;

    afterEach(async () => {
        if (organizationId) await cleanupOrg(organizationId);
        organizationId = 0;
    });

    async function setUp() {
        const { organization, user } = await createOrgWithUser(["lead:read", "lead:update", "lead:all", "activity:all"]);
        organizationId = organization.id;
        const org = { organizationId };
        const colleague = await prisma.user.create({
            data: { ...org, roleId: user.roleId, name: "Priya Sharma", email: `priya-${organizationId}@example.com`, passwordHash: "x" },
        });
        (getCurrentUser as Mock).mockResolvedValue(user);
        const stage = await createLeadStage(organizationId, { name: "New", order: 0 });
        return { org, user, colleague, stage };
    }

    const bellOf = (userId: number) => prisma.notification.findMany({ where: { userId }, orderBy: { id: "asc" } });

    it("tells someone they were given a lead, and nobody about their own actions", async () => {
        const { org, user, colleague, stage } = await setUp();
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul Mehta", stageId: stage.id, assignedToId: user.id } });

        expect((await assignLead(json("POST", { assignedToId: colleague.id }), params(lead.id))).status).toBe(200);
        expect(await bellOf(colleague.id)).toMatchObject([
            { type: "LEAD_ASSIGNED", actorId: user.id, body: "Rahul Mehta", link: `/leads?open=${lead.id}`, readAt: null },
        ]);

        // taking it back yourself: nothing for you
        await assignLead(json("POST", { assignedToId: user.id }), params(lead.id));
        expect(await bellOf(user.id)).toHaveLength(0);
    });

    it("lists your own bell with an unread count, and marks one or all read", async () => {
        const { org, user, colleague } = await setUp();
        const base = { ...org, type: "LEAD_ASSIGNED", title: "Assigned" };
        const [first] = await prisma.notification.createManyAndReturn({
            data: [{ ...base, userId: user.id }, { ...base, userId: user.id }, { ...base, userId: colleague.id }],
        });

        const bell = async () => (await getBell()).json();
        expect(await bell()).toMatchObject({ unread: 2 });
        expect((await bell()).data).toHaveLength(2);

        await markRead(json("PATCH", { ids: [first.id] }));
        expect(await bell()).toMatchObject({ unread: 1 });

        await markRead(json("PATCH", { all: true }));
        expect(await bell()).toMatchObject({ unread: 0 });
        // "all" only ever means your own
        expect((await bellOf(colleague.id))[0].readAt).toBeNull();
    });

    it("tells people @-mentioned in a note", async () => {
        const { org, user, colleague, stage } = await setUp();
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul Mehta", stageId: stage.id, assignedToId: user.id } });

        const res = await addLeadNote(json("POST", { body: "@Priya can you call him?", mentionedUserIds: [colleague.id] }), params(lead.id));
        expect(res.status).toBe(201);
        expect(await bellOf(colleague.id)).toMatchObject([{ type: "MENTIONED", title: expect.stringContaining("mentioned you on Rahul Mehta") }]);
    });

    it("puts a note and a meeting on the lead's timeline, the meeting linked", async () => {
        const { org, user, stage } = await setUp();
        const lead = await prisma.lead.create({ data: { ...org, name: "Rahul Mehta", stageId: stage.id, assignedToId: user.id } });

        await addLeadNote(json("POST", { body: "Wants a demo next week", mentionedUserIds: [] }), params(lead.id));
        const res = await createActivity(json("POST", { type: "MEETING", title: "Demo with Rahul", scheduledAt: inMinutes(120).toISOString(), leadId: lead.id }));
        const activity = (await res.json()).data;

        const entries = await prisma.leadTimeline.findMany({ where: { leadId: lead.id }, orderBy: { id: "asc" } });
        expect(entries.map(({ type, message, metadata }) => ({ type, message, metadata }))).toEqual([
            { type: "NOTE_ADDED", message: "Note added: Wants a demo next week", metadata: null },
            { type: "ACTIVITY_SCHEDULED", message: "Meeting scheduled: Demo with Rahul", metadata: { activityId: activity.id } },
        ]);
    });

    it("tells people added to a meeting, only once, and re-arms the reminder when it moves", async () => {
        const { user, colleague } = await setUp();

        const res = await createActivity(json("POST", { type: "MEETING", title: "Demo with Acme", scheduledAt: inMinutes(120).toISOString() }));
        const activity = (await res.json()).data;
        expect(await bellOf(user.id)).toHaveLength(0);

        await updateActivity(json("PUT", { attendeeIds: [colleague.id] }), params(activity.id));
        // saving again with the same people doesn't tell them twice
        await updateActivity(json("PUT", { attendeeIds: [colleague.id], title: "Demo with Acme (v2)" }), params(activity.id));
        expect(await bellOf(colleague.id)).toMatchObject([{ type: "ACTIVITY_INVITED", body: "Demo with Acme" }]);

        await prisma.scheduledActivity.update({ where: { id: activity.id }, data: { reminderSentAt: new Date() } });
        await updateActivity(json("PUT", { scheduledAt: inMinutes(180).toISOString() }), params(activity.id));
        expect((await prisma.scheduledActivity.findUniqueOrThrow({ where: { id: activity.id } })).reminderSentAt).toBeNull();
    });

    it("reminds whoever it's for and everyone tagged, 10 minutes before, once", async () => {
        const { org, user, colleague } = await setUp();
        const people = { assignedToId: user.id, createdById: user.id };
        const soon = await prisma.scheduledActivity.create({
            data: { ...org, ...people, type: "CALL", title: "Call Rahul", scheduledAt: inMinutes(5), attendees: { connect: [{ id: colleague.id }] } },
        });
        await prisma.scheduledActivity.create({ data: { ...org, ...people, type: "CALL", title: "Later call", scheduledAt: inMinutes(45) } });

        await sendReminders();
        await sendReminders();

        const reminders = await prisma.notification.findMany({ where: { organizationId, type: "REMINDER" } });
        expect(reminders.map((row) => row.userId).sort()).toEqual([user.id, colleague.id].sort());
        expect(reminders[0]).toMatchObject({ body: "Call Rahul", link: `/activities?open=${soon.id}`, actorId: null });
        expect(reminders[0].title).toMatch(/^Call in [45] minutes$/);
    });
});
