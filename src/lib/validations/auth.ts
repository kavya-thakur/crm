import { z } from "zod";
import { emailSchema, requiredText } from "./common";

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

// The profile page: you can change your own name and password, nothing else about you
export const updateProfileSchema = z.object({
    name: requiredText(200),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// "Forgot password?": the email to send the link to
export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

// The link's secret, and the new password
export const resetPasswordSchema = z.object({
    token: z.string().min(20).max(200),
    password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
