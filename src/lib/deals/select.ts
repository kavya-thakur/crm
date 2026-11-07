// What a deal shows about the lead it came from: who they are and how to reach them. A deal
// has no phone or email of its own; they're the person's, kept on their lead.
export const dealLeadSelect = { select: { id: true, name: true, phone: true, email: true } } as const;

// A deal's quote lines, in the order they were added
export const dealProductsInclude = { orderBy: { id: "asc" } } as const;
