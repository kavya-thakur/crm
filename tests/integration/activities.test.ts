import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createOrgWithUser, cleanupOrg } from "../helpers";

vi.mock("@/lib/auth/getCurrentUser", () => ({ getCurrentUser: vi.fn() }));
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { GET as listActivities, POST as createActivity } from "@/app/api/activities/route";
import { DELETE as deleteActivity, PUT as updateActivity } from "@/app/api/activities/[id]/route";

function jsonRequest(method: string, body: object) {
    return new NextRequest("http://localhost/api/activities", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function inDays(days: number) {
    return new Date(Date.now() + days * 86_400_000).toISOString();
}

describe("scheduled activities", () => {
    const organizationIds: number[] = [];

    afterEach(async () => {
        for (const organizationId of organizationIds.splice(0)) await cleanupOrg(organizationId);
    });

    async function setUpOrg() {
        const { organization, user } = await createOrgWithUser([]);
        organizationIds.push(organization.id);

        const colleague = await prisma.user.create({
            data: {
                organizationId: organization.id,
                roleId: user.roleId,
                name: "Colleague",
                email: `colleague-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
                passwordHash: "x",
            },
        });

        return { organization, user, colleague };
    }

    it("books an activity for the creator and tags the agents on it", async () => {
        const { user, colleague } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const res = await createActivity(
            jsonRequest("POST", { type: "MEETING", title: "Kickoff", scheduledAt: inDays(1), attendeeIds: [colleague.id] }),
        );
        const json = await res.json();

        expect(res.status).toBe(201);
        expect(json.data.assignedTo.id).toBe(user.id);
        expect(json.data.attendees.map((agent: { id: number }) => agent.id)).toEqual([colleague.id]);
    });

    it("refuses to tag an agent from another organization", async () => {
        const { user } = await setUpOrg();
        const { colleague: outsider } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const res = await createActivity(
            jsonRequest("POST", { type: "CALL", title: "Sneaky", scheduledAt: inDays(1), attendeeIds: [outsider.id] }),
        );

        expect(res.status).toBe(400);
        expect(await prisma.scheduledActivity.count({ where: { title: "Sneaky" } })).toBe(0);
    });

    it("shows an activity on the schedule of an agent who is tagged on it", async () => {
        const { user, colleague } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        await createActivity(
            jsonRequest("POST", { type: "MEETING", title: "Team sync", scheduledAt: inDays(1), attendeeIds: [colleague.id] }),
        );
        await createActivity(jsonRequest("POST", { type: "CALL", title: "Just mine", scheduledAt: inDays(2) }));

        // the colleague only sees the one they were tagged on
        (getCurrentUser as Mock).mockResolvedValue({ ...user, id: colleague.id });
        const res = await listActivities(new NextRequest("http://localhost/api/activities?assignedTo=me"));
        const json = await res.json();

        expect(json.data.map((activity: { title: string }) => activity.title)).toEqual(["Team sync"]);
    });

    it("lists the scheduled ones from a moment on, soonest first, for the start-time popup", async () => {
        const { user } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);
        const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

        await createActivity(jsonRequest("POST", { type: "CALL", title: "Long gone", scheduledAt: minutesAgo(60) }));
        await createActivity(jsonRequest("POST", { type: "CALL", title: "Just started", scheduledAt: minutesAgo(2) }));
        await createActivity(jsonRequest("POST", { type: "MEETING", title: "Tomorrow", scheduledAt: inDays(1) }));

        const from = encodeURIComponent(minutesAgo(15));
        const res = await listActivities(new NextRequest(`http://localhost/api/activities?scope=all&status=SCHEDULED&assignedTo=me&from=${from}`));
        const json = await res.json();

        expect(json.data.map((activity: { title: string }) => activity.title)).toEqual(["Just started", "Tomorrow"]);
    });

    it("reschedules, changes who is tagged, and completes an activity", async () => {
        const { user, colleague } = await setUpOrg();
        (getCurrentUser as Mock).mockResolvedValue(user);

        const created = await (
            await createActivity(
                jsonRequest("POST", { type: "CALL", title: "Follow up", scheduledAt: inDays(1), attendeeIds: [colleague.id] }),
            )
        ).json();
        const params = { params: Promise.resolve({ id: String(created.data.id) }) };

        const newTime = inDays(3);
        const updated = await (
            await updateActivity(jsonRequest("PUT", { scheduledAt: newTime, attendeeIds: [], status: "COMPLETED" }), params)
        ).json();

        expect(new Date(updated.data.scheduledAt).toISOString()).toBe(newTime);
        expect(updated.data.attendees).toEqual([]);
        expect(updated.data.status).toBe("COMPLETED");
    });

    it("deletes an activity, but not one that belongs to another organization", async () => {
        const { user } = await setUpOrg();
        const { user: otherUser } = await setUpOrg();

        (getCurrentUser as Mock).mockResolvedValue(user);
        const created = await (
            await createActivity(jsonRequest("POST", { type: "OTHER", title: "Delete me", scheduledAt: inDays(1) }))
        ).json();
        const params = { params: Promise.resolve({ id: String(created.data.id) }) };

        (getCurrentUser as Mock).mockResolvedValue(otherUser);
        const foreign = await deleteActivity(new NextRequest("http://localhost/api/activities/1", { method: "DELETE" }), params);
        expect(foreign.status).toBe(404);

        (getCurrentUser as Mock).mockResolvedValue(user);
        const own = await deleteActivity(new NextRequest("http://localhost/api/activities/1", { method: "DELETE" }), params);
        expect(own.status).toBe(200);
        expect(await prisma.scheduledActivity.count({ where: { id: created.data.id } })).toBe(0);
    });
});
