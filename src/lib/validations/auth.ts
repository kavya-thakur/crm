import { z } from "zod";
import { emailSchema } from "./common";

export const registerSchema = z.object({
    organizationName: z.string().trim().min(1, "Organization name is required"),
    name: z.string().trim().min(1, "Name is required"),
    email: emailSchema,
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
