"use client";

import { Controller, useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
    IconAddressBook,
    IconFileDescription,
    IconMail,
    IconPhone,
    IconUserCircle,
} from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Select } from "@/components/Select";
import { createContactSchema } from "@/lib/validations/contact";
import { FormFieldRow, FormIdentityHeader, FormSection, RecordFormShell } from "../shared/FullPageForm";
import { CustomFieldsFormSection, useCustomFields } from "../shared/customFields";
import { type Agent, type Contact } from "./shared";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

interface NewContactDialogProps {
    open: boolean;
    canAssign: boolean;
    agents?: Agent[];
    onClose: () => void;
    onCreated: (contact: Contact) => void;
}

export default function NewContactDialog({ open, ...props }: NewContactDialogProps) {
    if (!open) return null;
    return <NewContactForm {...props} />;
}

function NewContactForm({ canAssign, agents, onClose, onCreated }: Omit<NewContactDialogProps, "open">) {
    const {
        register,
        control,
        handleSubmit,
        formState: { errors },
    } = useForm({
        // the same schema POST /api/contacts validates with
        resolver: zodResolver(createContactSchema),
    });

    const create = useMutation({
        mutationFn: (values: unknown) => api.post<{ data: Contact }>("/contacts", values).then((res) => res.data.data),
        onSuccess: onCreated,
    });

    const customFieldsQuery = useCustomFields("contact");

    return (
        <RecordFormShell
            icon={IconAddressBook}
            entityLabel="Contacts"
            noun="contact"
            formId="new-contact-form"
            onCancel={onClose}
            onSubmit={handleSubmit((values) => create.mutate(values))}
            submitDisabled={create.isPending}
        >
            <FormIdentityHeader placeholder="Contact name *" error={errors.name?.message} registerProps={register("name")} />

            <FormSection title="Contact Details">
                <FormFieldRow icon={IconMail} label="Email">
                    <input type="email" placeholder="jane@acme.com" aria-invalid={!!errors.email} {...register("email")} className={inputClassName} />
                </FormFieldRow>

                <FormFieldRow icon={IconPhone} label="Phone" required>
                    <input type="tel" placeholder="+91 555 0100" aria-invalid={!!errors.phone} {...register("phone")} className={inputClassName} />
                </FormFieldRow>

                <FormFieldRow icon={IconUserCircle} label="Job title">
                    <input placeholder="Head of Sales" {...register("jobTitle")} className={inputClassName} />
                </FormFieldRow>
            </FormSection>

            {canAssign && agents && (
                <FormSection title="Assigned Agent">
                    <FormFieldRow icon={IconUserCircle} label="Agent">
                        <Controller
                            name="assignedToId"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    // "" = leave it to the API (assigns to you), "none" = nobody, otherwise an agent id
                                    value={field.value === undefined ? "" : field.value === null ? "none" : String(field.value)}
                                    onChange={(value) => field.onChange(value === "" || value === undefined ? undefined : value === "none" ? null : Number(value))}
                                    placeholder="Me"
                                    options={[
                                        { value: "", label: "Me" },
                                        { value: "none", label: "Unassigned" },
                                        ...agents.map((agent) => ({ value: String(agent.id), label: agent.name })),
                                    ]}
                                />
                            )}
                        />
                    </FormFieldRow>
                </FormSection>
            )}

            <FormSection title="Description">
                <FormFieldRow icon={IconFileDescription} label="Notes">
                    <textarea
                        rows={3}
                        placeholder="Notes about this contact..."
                        {...register("description")}
                        className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </FormFieldRow>
            </FormSection>

            <CustomFieldsFormSection
                fields={customFieldsQuery.data ?? []}
                register={register}
                control={control as Control<any>}
                agents={agents}
            />

            {create.isError && (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(create.error)}
                </p>
            )}
        </RecordFormShell>
    );
}
