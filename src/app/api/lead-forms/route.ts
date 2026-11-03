import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { createLeadFormSchema } from "@/lib/validations/leadForms";

// what the settings page shows for each form
const leadFormInclude = {
    source: { select: { id: true, name: true, color: true } },
    owner: { select: { id: true, name: true } },
} as const;

export async function GET() {
    try {
        const user = await requirePermission("lead-forms:manage");

        const forms = await prisma.leadForm.findMany({
            where: { organizationId: user.organizationId },
            orderBy: { createdAt: "asc" },
            include: leadFormInclude,
        });

        return NextResponse.json({ ok: true, data: forms });
    } catch (error) {
        return handleRouteError(error, "Get web forms");
    }
}

// A new form starts by giving its leads to whoever made it, tagged with a fitting source
// (see startingSource); both can be changed
export async function POST(req: NextRequest) {
    try {
        const user = await requirePermission("lead-forms:manage");

        const body = await parseBody(req, createLeadFormSchema);

        if (!body.success) {
            return body.response;
        }

        const form = await prisma.leadForm.create({
            data: {
                organizationId: user.organizationId,
                name: body.data.name,
                kind: body.data.kind,
                sourceId: await startingSource(user.organizationId, body.data),
                // 24 random characters: the form's public id, which nobody could guess
                key: randomBytes(18).toString("base64url"),
                ownerId: user.id,
            },
            include: leadFormInclude,
        });

        return NextResponse.json({ ok: true, message: "Form created", data: form }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Create web form");
    }
}

/**
 * Where a new form's leads are tagged from the start. A web form: the workspace's "Website"
 * source, if it has one. An integration: a source with the integration's own name ("Google
 * Ads"), made at the end of the list if there isn't one yet, so its leads are told apart in
 * filters and on the dashboard's source card from the first lead.
 */
async function startingSource(organizationId: number, { name, kind }: { name: string; kind: "FORM" | "WEBHOOK" }) {
    const wanted = (kind === "WEBHOOK" ? name : "Website").slice(0, 50);
    const existing = await prisma.leadSource.findFirst({
        where: { organizationId, name: { equals: wanted, mode: "insensitive" } },
        select: { id: true },
    });
    if (existing || kind === "FORM") return existing?.id ?? null;

    const last = await prisma.leadSource.findFirst({ where: { organizationId }, orderBy: { order: "desc" }, select: { order: true } });
    const source = await prisma.leadSource.create({ data: { organizationId, name: wanted, order: (last?.order ?? -1) + 1 }, select: { id: true } });
    return source.id;
}
