import { prisma } from "@/lib/db/prisma";

// Leads that are probably the same person as a new one: the same email (in any case), or
// the same phone number. Phones are stored as typed, so they're compared by their last 10
// digits: "+91 98765-43210" and "9876543210" are one number.
// Used to warn before creating a duplicate, and by web forms to skip one.
export async function findSimilarLeads(organizationId: number, { email, phone }: { email?: string | null; phone?: string | null }) {
    const digits = phone?.replace(/\D/g, "").slice(-10) ?? "";
    const cleanEmail = email?.trim();

    // too little to go on: half an email or a few digits would match all sorts of people
    const useEmail = cleanEmail && cleanEmail.includes("@") ? cleanEmail : null;
    const usePhone = digits.length >= 7 ? digits : null;
    if (!useEmail && !usePhone) return [];

    const phoneMatches = usePhone
        ? await prisma.$queryRaw<{ id: number }[]>`
              SELECT "id" FROM "Lead"
              WHERE "organizationId" = ${organizationId}
                AND RIGHT(regexp_replace(COALESCE("phone", ''), '\\D', '', 'g'), 10) = ${usePhone}`
        : [];

    return prisma.lead.findMany({
        where: {
            organizationId,
            OR: [
                ...(useEmail ? [{ email: { equals: useEmail, mode: "insensitive" as const } }] : []),
                ...(phoneMatches.length > 0 ? [{ id: { in: phoneMatches.map((row) => row.id) } }] : []),
            ],
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
            id: true,
            name: true,
            companyName: true,
            email: true,
            phone: true,
            assignedToId: true,
            stage: { select: { name: true, color: true, isConverted: true, isLost: true } },
            assignedTo: { select: { name: true } },
        },
    });
}
