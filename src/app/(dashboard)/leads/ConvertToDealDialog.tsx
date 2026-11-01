"use client";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IconProgress } from "@tabler/icons-react";
import { api, errorMessage } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { StageLabel } from "@/app/(dashboard)/deals/shared";
import { createDealSchema } from "@/lib/validations/deals";

interface PipelineStage {
    id: number;
    name: string;
    color: string;
}

interface OptionsResponse<T> {
    ok: boolean;
    data: T[];
}

// The lead and its current assignee carry over automatically; only what a
// deal needs beyond the lead itself is asked for here.
const convertFormSchema = createDealSchema.omit({ leadId: true, assignedToId: true });

interface ConvertToDealDialogProps {
    open: boolean;
    leadId: number;
    leadName: string;
    onClose: () => void;
    onConverted: () => void;
}

export default function ConvertToDealDialog({ open, onClose, ...props }: ConvertToDealDialogProps) {
    return (
        <Modal open={open} onClose={onClose}>
            <ConvertToDealForm open={open} onClose={onClose} {...props} />
        </Modal>
    );
}

function ConvertToDealForm({ open, leadId, leadName, onClose, onConverted }: ConvertToDealDialogProps) {
    const {
        register,
        control,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(convertFormSchema),
        defaultValues: {
            title: leadName,
            amount: 0,
            probability: 0,
            pipelineStageId: undefined,
            expectedCloseDate: null,
            description: "",
        },
    });

    const stagesQuery = useQuery({
        queryKey: ["pipelineStage"],
        queryFn: () =>
            api
                .get<OptionsResponse<PipelineStage>>("/pipeline-stages")
                .then((res) => res.data.data),
        enabled: open,
    });

    // Reset to a fresh form (with the first stage preselected) each time the dialog opens
    useEffect(() => {
        if (open && stagesQuery.data?.length) {
            reset({
                title: leadName,
                amount: 0,
                probability: 0,
                pipelineStageId: stagesQuery.data[0].id,
                expectedCloseDate: null,
                description: "",
            });
        }
    }, [open, stagesQuery.data, leadName, reset]);

    const convert = useMutation({
        mutationFn: (values: {
            title: string;
            amount: number;
            probability: number;
            pipelineStageId: number;
            expectedCloseDate?: string | null;
            description?: string | null;
        }) => api.post(`/leads/${leadId}/convert`, values),
        onSuccess: () => {
            reset();
            onConverted();
        },
    });

    return (
        <form
            noValidate
            onSubmit={handleSubmit((values) =>
                convert.mutate({
                    ...values,
                    amount: Number(values.amount),
                    probability: Number(values.probability),
                    pipelineStageId: Number(values.pipelineStageId),
                    expectedCloseDate: values.expectedCloseDate
                        ? new Date(values.expectedCloseDate).toISOString()
                        : null,
                    description: values.description || null,
                }),
            )}
        >
            <h2 className="border-b border-line-light px-5 py-4 text-lg font-semibold">Convert to deal</h2>

            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
                <div>
                    <label htmlFor="convert-title" className="mb-1 block text-sm font-medium text-muted">
                        Deal title <span className="text-danger">*</span>
                    </label>
                    <input
                        id="convert-title"
                        autoFocus
                        aria-invalid={!!errors.title}
                        {...register("title")}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.title && <p className="mt-1 text-sm text-danger">{errors.title.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="convert-amount" className="mb-1 block text-sm font-medium text-muted">
                            Amount (₹)
                        </label>
                        <input
                            id="convert-amount"
                            type="number"
                            min="0"
                            step="0.01"
                            {...register("amount", { valueAsNumber: true })}
                            className="h-8 w-full rounded-lg border border-line px-2 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                        />
                        {errors.amount && <p className="mt-1 text-sm text-danger">{errors.amount.message}</p>}
                    </div>
                    <div>
                        <label htmlFor="convert-probability" className="mb-1 block text-sm font-medium text-muted">
                            Probability (%)
                        </label>
                        <input
                            id="convert-probability"
                            type="number"
                            min="0"
                            max="100"
                            {...register("probability", { valueAsNumber: true })}
                            className="h-8 w-full rounded-lg border border-line px-2 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                        />
                        {errors.probability && <p className="mt-1 text-sm text-danger">{errors.probability.message}</p>}
                    </div>
                </div>

                <div>
                    <label htmlFor="convert-stage" className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted">
                        <IconProgress size={14} /> Pipeline stage <span className="text-danger">*</span>
                    </label>
                    <Controller
                        name="pipelineStageId"
                        control={control}
                        render={({ field }) => (
                            <Select
                                disabled={stagesQuery.isPending || !stagesQuery.data?.length}
                                value={field.value !== undefined ? String(field.value) : undefined}
                                onChange={(value) => field.onChange(value === undefined ? undefined : Number(value))}
                                placeholder="Select a stage"
                                options={(stagesQuery.data ?? []).map((stage) => ({
                                    value: String(stage.id),
                                    label: stage.name,
                                    render: <StageLabel stage={stage} />,
                                }))}
                            />
                        )}
                    />
                    {errors.pipelineStageId && (
                        <p className="mt-1 text-sm text-danger">{errors.pipelineStageId.message}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="convert-close-date" className="mb-1 block text-sm font-medium text-muted">
                        Expected close date
                    </label>
                    <input
                        id="convert-close-date"
                        type="date"
                        {...register("expectedCloseDate", {
                            setValueAs: (value) => (value ? new Date(`${value}T12:00:00`).toISOString() : null),
                        })}
                        className="h-8 w-full rounded-lg border border-line px-2 outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.expectedCloseDate && (
                        <p className="mt-1 text-sm text-danger">{errors.expectedCloseDate.message}</p>
                    )}
                </div>

                <div>
                    <label htmlFor="convert-description" className="mb-1 block text-sm font-medium text-muted">
                        Description
                    </label>
                    <textarea
                        id="convert-description"
                        rows={3}
                        placeholder="Add details about this deal..."
                        {...register("description")}
                        className="w-full resize-y rounded-lg border border-line px-2 py-2 outline-none placeholder:text-light focus:border-accent focus:ring-3 focus:ring-accent-soft"
                    />
                    {errors.description && <p className="mt-1 text-sm text-danger">{errors.description.message}</p>}
                </div>

                {convert.isError && (
                    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                        {errorMessage(convert.error)}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line-light px-5 py-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="h-8 rounded-lg border border-fill bg-black/2 px-3 font-medium text-muted hover:bg-app"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={convert.isPending || stagesQuery.isPending || !stagesQuery.data?.length}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
                >
                    {convert.isPending && <Spinner size={14} />}
                    Convert to deal
                </button>
            </div>
        </form>
    );
}
