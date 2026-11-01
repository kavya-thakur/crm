"use client";

import { IconBriefcase, IconTargetArrow } from "@tabler/icons-react";

import { SectionIcon } from "@/components/SectionIcon";
import { OptionListEditor, type OptionListConfig } from "./OptionListEditor";

const LEAD_STAGES: OptionListConfig = {
    title: "Lead stages",
    description: "The columns of the leads board, in order. A converted or lost stage closes the lead.",
    endpoint: "/lead-stages",
    queryKey: "leadStage",
    flags: [
        { key: "isConverted", word: "converted", tone: "green" },
        { key: "isLost", word: "lost", tone: "red" },
    ],
    recordLabel: "Lead",
    recordIcon: IconTargetArrow,
    fieldLabel: "Stage",
};

const LEAD_SOURCES: OptionListConfig = {
    title: "Lead sources",
    description: "Where your leads come from. Removing a source leaves its leads without one.",
    endpoint: "/lead-sources",
    queryKey: "leadSource",
    flags: [],
    recordLabel: "Lead",
    recordIcon: IconTargetArrow,
    fieldLabel: "Source",
};

const PIPELINE_STAGES: OptionListConfig = {
    title: "Pipeline stages",
    description: "The columns of the deals board, in order. A won or lost stage closes the deal.",
    endpoint: "/pipeline-stages",
    queryKey: "pipelineStage",
    flags: [
        { key: "isWon", word: "won", tone: "green" },
        { key: "isLost", word: "lost", tone: "red" },
    ],
    recordLabel: "Deal",
    recordIcon: IconBriefcase,
    fieldLabel: "Stage",
};

export default function StagesView({ show }: { show: { leadStages: boolean; leadSources: boolean; pipeline: boolean } }) {
    const sections = [show.leadStages && LEAD_STAGES, show.leadSources && LEAD_SOURCES, show.pipeline && PIPELINE_STAGES].filter(
        (config) => config !== false,
    );

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-paper px-3">
                <SectionIcon section="stages" size="md" />
                <h1 className="font-semibold">Stages & sources</h1>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-8">
                    {sections.map((config) => (
                        <section key={config.endpoint}>
                            <h2 className="text-[17px] leading-6 font-semibold tracking-[-0.01em]">{config.title}</h2>
                            <p className="mt-0.5 mb-4 text-muted">{config.description}</p>
                            <OptionListEditor config={config} />
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
