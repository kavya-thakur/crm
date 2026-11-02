import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { hasPermission, type CurrentUser } from "@/lib/auth/requirePermission";

// The same cleaning the database does for Lead.phoneKey and emailKey (see the migration
// add_lead_match_keys): a phone's last 10 digits, so "+91 98765-43210" and "9876543210" are
// one number, and an email in lower case. Too little to go on (half an email, a few digits)
// gives null, since it would match all sorts of people.
export function matchKeys({ email, phone }: { email?: string | null; phone?: string | null }) {
    const digits = phone?.replace(/\D/g, "") ?? "";
    const cleanEmail = email?.trim().toLowerCase();
    return {
        phoneKey: digits.length >= 7 ? digits.slice(-10) : null,
        emailKey: cleanEmail?.includes("@") ? cleanEmail : null,
    };
}

// Still being worked on: not converted, not lost
export const OPEN_STAGE = { isConverted: false, isLost: false };

export function isOpen(stage: { isConverted: boolean; isLost: boolean }) {
    return !stage.isConverted && !stage.isLost;
}

// Leads that are probably the same person: the same email or the same phone number.
// Used to stop a second open lead for someone (new lead, web forms), and by a lead's
// panel to offer merging (passing its own id as exceptId, so it doesn't find itself).
export async function findSimilarLeads(
    organizationId: number,
    { email, phone, exceptId }: { email?: string | null; phone?: string | null; exceptId?: number }
) {
    const { phoneKey, emailKey } = matchKeys({ email, phone });
    if (!phoneKey && !emailKey) return [];

    return prisma.lead.findMany({
        where: {
            organizationId,
            ...(exceptId && { id: { not: exceptId } }),
            OR: [...(phoneKey ? [{ phoneKey }] : []), ...(emailKey ? [{ emailKey }] : [])],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
            id: true,
            name: true,
            companyName: true,
            emailKey: true,
            assignedToId: true,
            stage: { select: { name: true, color: true, isConverted: true, isLost: true } },
            assignedTo: { select: { name: true } },
        },
    });
}

// The first open lead that's the same person, if any: the one rule for "already a lead"
export async function findOpenCopy(organizationId: number, person: { email?: string | null; phone?: string | null; exceptId?: number }) {
    return (await findSimilarLeads(organizationId, person)).find((lead) => isOpen(lead.stage));
}

/**
 * For a page of leads: which open ones have another open lead for the same person among the
 * leads this user can see, so the list and board can mark them. Two queries in all, however
 * many leads are on the page. Adds `duplicates: { count, name }` (null when there are none).
 */
export async function withDuplicateHints<
    TLead extends { id: number; phoneKey: string | null; emailKey: string | null; stage: { isConverted: boolean; isLost: boolean } },
>(leads: TLead[], scope: Prisma.LeadWhereInput) {
    const open = leads.filter((lead) => isOpen(lead.stage) && (lead.phoneKey || lead.emailKey));
    const phoneKeys = open.flatMap((lead) => (lead.phoneKey ? [lead.phoneKey] : []));
    const emailKeys = open.flatMap((lead) => (lead.emailKey ? [lead.emailKey] : []));

    const others =
        open.length === 0
            ? []
            : await prisma.lead.findMany({
                  where: { ...scope, stage: OPEN_STAGE, OR: [{ phoneKey: { in: phoneKeys } }, { emailKey: { in: emailKeys } }] },
                  select: { id: true, name: true, phoneKey: true, emailKey: true },
              });

    return leads.map((lead) => {
        const copies = isOpen(lead.stage)
            ? others.filter(
                  (other) =>
                      other.id !== lead.id &&
                      ((lead.phoneKey && other.phoneKey === lead.phoneKey) || (lead.emailKey && other.emailKey === lead.emailKey)),
              )
            : [];
        return { ...lead, duplicates: copies.length > 0 ? { count: copies.length, name: copies[0].name } : null };
    });
}

// The "Possible duplicates" filter: open leads (among those this user can see) that share a
// phone or email with another open one
export async function duplicateLeadsWhere(scope: Prisma.LeadWhereInput): Promise<Prisma.LeadWhereInput> {
    const where = { ...scope, stage: OPEN_STAGE };
    const [phones, emails] = await Promise.all([
        prisma.lead.groupBy({ by: ["phoneKey"], where: { ...where, phoneKey: { not: null } }, having: { phoneKey: { _count: { gt: 1 } } } }),
        prisma.lead.groupBy({ by: ["emailKey"], where: { ...where, emailKey: { not: null } }, having: { emailKey: { _count: { gt: 1 } } } }),
    ]);

    return {
        stage: OPEN_STAGE,
        OR: [{ phoneKey: { in: phones.map((row) => row.phoneKey!) } }, { emailKey: { in: emails.map((row) => row.emailKey!) } }],
    };
}

// The answer when someone tries to add a second open lead for a person: which lead they
// already are, so the page can offer to open it instead
export function alreadyALead(copy: NonNullable<Awaited<ReturnType<typeof findOpenCopy>>>, user: CurrentUser) {
    const owner = copy.assignedTo?.name ?? null;
    return NextResponse.json(
        {
            ok: false,
            message: `${copy.name} is already an open lead${owner ? `, owned by ${owner}` : ""}. Open that one instead of adding a second.`,
            duplicate: { id: copy.id, name: copy.name, owner, canOpen: hasPermission(user, "lead:all") || copy.assignedToId === user.id },
        },
        { status: 409 }
    );
}
