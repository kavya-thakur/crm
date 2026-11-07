import type { Prisma } from "@/generated/prisma/client";

/*
 * Companies (the Companies page): a company groups its contacts, and through their leads, its
 * deals. New leads fill it in by themselves: a lead that says "Acme" puts its contact under the
 * company "Acme", found ignoring case, or made if it's the first.
 */

type Db = Pick<Prisma.TransactionClient, "company" | "contact">;

// The workspace's company of this name (ignoring case and spaces at the ends), made if there's none
export async function companyNamed(db: Db, organizationId: number, name: string) {
    const clean = name.trim().slice(0, 200);
    return (
        (await db.company.findFirst({ where: { organizationId, name: { equals: clean, mode: "insensitive" } }, select: { id: true, name: true } })) ??
        (await db.company.create({ data: { organizationId, name: clean }, select: { id: true, name: true } }))
    );
}

// Puts a contact under the company a lead names, unless it's already under one
export async function linkToCompany(db: Db, organizationId: number, contactId: number | null | undefined, companyName: string | null | undefined) {
    if (!contactId || !companyName?.trim()) return;
    const contact = await db.contact.findUnique({ where: { id: contactId }, select: { companyId: true } });
    if (!contact || contact.companyId) return;
    const company = await companyNamed(db, organizationId, companyName);
    await db.contact.update({ where: { id: contactId }, data: { companyId: company.id } });
}

// A company changed by hand on leads (a lead's panel, the table, bulk edit): their contacts move to
// the company it now names, or out of their company when it's cleared
export async function moveToCompany(db: Db & Pick<Prisma.TransactionClient, "lead">, organizationId: number, leadIds: number[], companyName: string | null) {
    const leads = await db.lead.findMany({ where: { id: { in: leadIds }, organizationId, contactId: { not: null } }, select: { contactId: true } });
    const contactIds = [...new Set(leads.map((lead) => lead.contactId!))];
    if (contactIds.length === 0) return;
    const company = companyName?.trim() ? await companyNamed(db, organizationId, companyName) : null;
    await db.contact.updateMany({ where: { id: { in: contactIds }, organizationId }, data: { companyId: company?.id ?? null } });
}
