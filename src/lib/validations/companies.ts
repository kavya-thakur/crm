import { z } from "zod";
import { capitalizeFirst, hasAnyField, optionalText, requiredText } from "./common";

export const createCompanySchema = z.object({
    name: requiredText(200).transform(capitalizeFirst),
    website: optionalText(255),
    industry: optionalText(100),
    phone: optionalText(20),
    description: optionalText(5000),
});

export const updateCompanySchema = createCompanySchema.partial().refine(hasAnyField, "Provide at least one field to update");

export const listCompaniesQuerySchema = z.object({
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
});
