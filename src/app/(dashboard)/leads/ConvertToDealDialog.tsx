"use client";
import { currencySymbol } from "@/lib/utils/format";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IconProgress, IconTimeline } from "@tabler/icons-react";
import { api, errorMessage } from "@/lib/api/client";
import { Spinner } from "@/components/Loader";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { StageLabel, usePipelines } from "@/app/(dashboard)/deals/shared";
import { createDealSchema } from "@/lib/validations/deals";

interface PipelineStage {
    id: number;
    name: string;
    color: string;
    pipelineId: number;
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
        setValue,
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

    const pipelinesQuery = usePipelines(open);
    const pipelines = pipelinesQuery.data ?? [];

    // The deal's pipeline is its stage's, so the Pipeline field just narrows the Stage list
    const allStages = stagesQuery.data ?? [];
    const stageId = useWatch({ control, name: "pipelineStageId" });
    const dealPipelineId = allStages.find((stage) => stage.id === stageId)?.pipelineId;
    const stages = allStages.filter((stage) => dealPipelineId === undefined || stage.pipelineId === dealPipelineId);

    // Reset to a fresh form (with the first pipeline's first stage preselected) each time the dialog opens
    const firstStageId = allStages[0]?.id;
    useEffect(() => {
        if (open && firstStageId) {
            reset({
                title: leadName,
                amount: 0,
                probability: 0,
                pipelineStageId: firstStageId,
                expectedCloseDate: null,
                description: "",
            });
        }
    }, [open, firstStageId, leadName, reset]);

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
                            Amount ({currencySymbol()})
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

                {pipelines.length > 1 && (
                    <div>
                        <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted">
                            <IconTimeline size={14} /> Pipeline <span className="text-danger">*</span>
                        </span>
                        <Select
                            disabled={stagesQuery.isPending}
                            value={dealPipelineId !== undefined ? String(dealPipelineId) : undefined}
                            // another pipeline starts the deal at its first stage
                            onChange={(value) => {
                                const first = allStages.find((stage) => String(stage.pipelineId) === value);
                                if (first) setValue("pipelineStageId", first.id, { shouldValidate: true });
                            }}
                            placeholder="Select a pipeline"
                            options={pipelines.map((pipeline) => ({ value: String(pipeline.id), label: pipeline.name }))}
                        />
                    </div>
                )}

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
                                options={stages.map((stage) => ({
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
