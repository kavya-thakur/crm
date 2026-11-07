import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { findVisibleRecord } from "@/lib/auth/requirePermission";
import { handleRouteError, parseBody } from "@/lib/api/http";
import { whatsappLogSchema } from "@/lib/validations/emails";

// Notes on the record's timeline that someone opened a WhatsApp chat from it (the browser opens
// the chat itself; WhatsApp doesn't tell us whether the message was sent)
export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error("UNAUTHORIZED");

        const body = await parseBody(req, whatsappLogSchema);
        if (!body.success) return body.response;

        const { leadId, dealId, contactId, template } = body.data;
        const record = await findVisibleRecord(user, { leadId, dealId, contactId });
        if (!record) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

        const entry = { userId: user.id, type: "WHATSAPP", message: template ? `Opened WhatsApp with the "${template}" message` : "Opened a WhatsApp chat" };
        if (leadId) await prisma.leadTimeline.create({ data: { ...entry, leadId } });
        else if (dealId) await prisma.dealTimeline.create({ data: { ...entry, dealId } });
        else await prisma.contactTimeline.create({ data: { ...entry, contactId: contactId! } });

        return NextResponse.json({ ok: true }, { status: 201 });
    } catch (error) {
        return handleRouteError(error, "Log WhatsApp chat");
    }
}
