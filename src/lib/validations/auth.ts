import { z } from "zod";
import { emailSchema, requiredText } from "./common";
import { CURRENCIES } from "@/lib/utils/format";

// Sign up is just the account; the workspace name, your name and currency come next, in /onboarding
export const registerSchema = z.object({
    email: emailSchema,
    password: z.string().min(8, "Password must be at least 8 characters"),
});

export const onboardingSchema = z.object({
    workspaceName: requiredText(100),
    name: requiredText(200),
    currency: z.enum(CURRENCIES.map((currency) => currency.code) as [string, ...string[]], "Pick one of the listed currencies"),
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
