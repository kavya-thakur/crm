import { z } from "zod";
import { capitalizeFirst, dbIdSchema, hasAnyField, optionalText, requiredText } from "./common";

const price = z.coerce.number().finite().min(0, "Can't be negative").max(9_999_999_999, "Too large");
const percent = z.coerce.number().finite().min(0, "Can't be negative").max(100, "At most 100%");

// A product in the catalogue (Settings > Products)
export const productSchema = z.object({
    name: requiredText(200).transform(capitalizeFirst),
    price,
    taxPercent: percent.default(0),
    description: optionalText(1000),
});

export const updateProductSchema = productSchema
    .extend({ taxPercent: percent })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");

// A line on a deal: a catalogue product (its name, price and tax are copied), or a one-off line
// typed in on the spot; quantity and discount either way
export const addDealProductSchema = z
    .object({
        productId: dbIdSchema.optional(),
        name: requiredText(200).optional(),
        price: price.optional(),
        taxPercent: percent.optional(),
        quantity: z.coerce.number().int().min(1).max(1_000_000).default(1),
        discountPercent: percent.default(0),
    })
    .refine((line) => line.productId !== undefined || (line.name !== undefined && line.price !== undefined), "Pick a product, or give the line a name and price");

// Changing a line on one deal only (the catalogue stays as it is)
export const updateDealProductSchema = z
    .object({
        name: requiredText(200),
        price,
        quantity: z.coerce.number().int().min(1).max(1_000_000),
        discountPercent: percent,
        taxPercent: percent,
    })
    .partial()
    .refine(hasAnyField, "Provide at least one field to update");
