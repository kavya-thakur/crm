import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { recordLink } from "@/lib/emails/send";
import { broadcastChange, notify } from "@/lib/realtime/notify";

// The smallest possible image: one transparent pixel (a 43-byte GIF)
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Open tracking: every email ends with a 1×1 image pointing here, so when the customer's mail
 * app shows the email, it loads this address. The first time, the email is marked opened and
 * its sender gets "Rahul opened your email" live. Always answers with the image, whatever
 * the token, so it never reveals which emails exist.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    try {
        const { token } = await params;
        const opened = new Date();

        // only the first open counts, even if two loads arrive together
        const { count } = await prisma.email.updateMany({ where: { trackingToken: token, status: "SENT", openedAt: null }, data: { openedAt: opened } });

        if (count === 1) {
            const email = await prisma.email.findUnique({
                where: { trackingToken: token },
                select: { organizationId: true, sentById: true, subject: true, leadId: true, dealId: true, lead: { select: { name: true } }, deal: { select: { title: true } } },
            });
            if (email) {
                broadcastChange(email.organizationId, "emails");
                await notify([email.sentById], {
                    organizationId: email.organizationId,
                    actorId: null,
                    type: "EMAIL_OPENED",
                    title: `${email.lead?.name ?? email.deal?.title ?? "Someone"} opened your email`,
                    body: email.subject,
                    link: recordLink(email),
                });
            }
        }
    } catch (error) {
        console.error("Email open tracking error:", error);
    }

    return new NextResponse(PIXEL, {
        headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" },
    });
}
