"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { IconCalendarDue, IconChecklist, IconFileDescription, IconFlag, IconUserCircle } from "@tabler/icons-react";

import { api, errorMessage } from "@/lib/api/client";
import { Select } from "@/components/Select";
import { toast } from "@/components/Toast";
import { createTaskSchema } from "@/lib/validations/tasks";
import { FormFieldRow, FormIdentityHeader, FormSection, RecordFormShell } from "../shared/FullPageForm";
import type { AgentOption } from "../shared/customFields";
import { PRIORITY_OPTIONS } from "../shared/tasks";
import type { Task } from "./shared";

const inputClassName =
    "h-8 w-full rounded-lg border border-line bg-surface px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft";

interface NewTaskDialogProps {
    // only when this user may see the team; without it a task is simply for yourself
    agents?: AgentOption[];
    onClose: () => void;
    onCreated: (task: Task) => void;
}

export default function NewTaskDialog({ agents, onClose, onCreated }: NewTaskDialogProps) {
    const {
        register,
        control,
        handleSubmit,
        formState: { errors },
    } = useForm({
        // the same schema POST /api/tasks validates with
        resolver: zodResolver(createTaskSchema),
        // the user's own calendar day, so "today" is what they'd expect
        defaultValues: { dueDate: new Date().toLocaleDateString("en-CA"), priority: "MEDIUM" as const },
    });

    const create = useMutation({
        mutationFn: (values: unknown) => api.post<{ data: Task }>("/tasks", values).then((res) => res.data.data),
        onSuccess: (task) => {
            toast.success("Task created");
            onCreated(task);
        },
    });

    return (
        <RecordFormShell
            icon={IconChecklist}
            entityLabel="Tasks"
            noun="task"
            formId="new-task-form"
            hideTabs
            onCancel={onClose}
            onSubmit={handleSubmit((values) => create.mutate(values))}
            submitDisabled={create.isPending}
        >
            <FormIdentityHeader placeholder="Task title *" error={errors.title?.message} registerProps={register("title")} />

            <FormSection title="Task Details">
                <FormFieldRow icon={IconCalendarDue} label="Due date" required>
                    <input type="date" aria-invalid={!!errors.dueDate} {...register("dueDate")} className={inputClassName} />
                </FormFieldRow>

                <FormFieldRow icon={IconFlag} label="Priority">
                    <Controller
                        name="priority"
                        control={control}
                        render={({ field }) => (
                            <Select
                                value={field.value}
                                onChange={(value) => field.onChange(value)}
                                placeholder="Priority"
                                options={PRIORITY_OPTIONS}
                            />
                        )}
                    />
                </FormFieldRow>

                {agents && (
                    <FormFieldRow icon={IconUserCircle} label="Assigned to">
                        <Controller
                            name="assignedToId"
                            control={control}
                            render={({ field }) => (
                                <Select
                                    // "" = leave it to the API (assigns to you), otherwise an agent id
                                    value={field.value === undefined ? "" : String(field.value)}
                                    onChange={(value) => field.onChange(value ? Number(value) : undefined)}
                                    placeholder="Me"
                                    options={[
                                        { value: "", label: "Me" },
                                        ...agents.map((agent) => ({ value: String(agent.id), label: agent.name })),
                                    ]}
                                />
                            )}
                        />
                    </FormFieldRow>
                )}
            </FormSection>

            <FormSection title="Description">
                <FormFieldRow icon={IconFileDescription} label="Notes">
                    <textarea
                        rows={4}
                        placeholder="What needs to be done..."
                        {...register("description")}
                        className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                </FormFieldRow>
            </FormSection>

            {create.isError && (
                <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-danger">
                    {errorMessage(create.error)}
                </p>
            )}
        </RecordFormShell>
    );
}
