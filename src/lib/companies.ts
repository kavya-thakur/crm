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

/**
 * linkToCompany for many contacts at once (a CSV import), in three queries however many there are:
 *  1. find every company the rows name (ignoring case), in one query
 *  2. make the ones that don't exist yet, in one insert
 *  3. put each contact under its company, in one UPDATE (Postgres's unnest turns the two id lists
 *     into rows: contact 5 → company 2, contact 6 → company 9, ...)
 * As with linkToCompany, a contact already under a company keeps it.
 */
export async function linkManyToCompanies(
    db: Db & Pick<Prisma.TransactionClient, "$executeRaw">,
    organizationId: number,
    links: { contactId: number; companyName: string }[],
) {
    if (links.length === 0) return;
    const clean = (name: string) => name.trim().slice(0, 200);
    const keyOf = (name: string) => clean(name).toLowerCase();

    // one spelling per company: the first one the file used ("Acme" and "ACME" are one company)
    const names = new Map<string, string>();
    for (const { companyName } of links) if (!names.has(keyOf(companyName))) names.set(keyOf(companyName), clean(companyName));

    const existing = await db.company.findMany({ where: { organizationId, name: { in: [...names.values()], mode: "insensitive" } }, select: { id: true, name: true } });
    const idByKey = new Map(existing.map((company) => [company.name.toLowerCase(), company.id]));

    const missing = [...names].filter(([key]) => !idByKey.has(key)).map(([, name]) => ({ organizationId, name }));
    if (missing.length > 0) {
        for (const company of await db.company.createManyAndReturn({ data: missing, select: { id: true, name: true } })) idByKey.set(company.name.toLowerCase(), company.id);
    }

    const contactIds = links.map((link) => link.contactId);
    const companyIds = links.map((link) => idByKey.get(keyOf(link.companyName))!);
    await db.$executeRaw`
        UPDATE "Contact" AS c SET "companyId" = v."companyId", "updatedAt" = now()
        FROM unnest(${contactIds}::int[], ${companyIds}::int[]) AS v(id, "companyId")
        WHERE c.id = v.id AND c."companyId" IS NULL`;
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
