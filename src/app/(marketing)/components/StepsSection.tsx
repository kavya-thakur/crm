import { StageBadge } from "@/components/StageBadge";
import { Avatar } from "@/components/Avatar";
import { Eyebrow, Heading } from "./Eyebrow";

const STEPS = [
    {
        number: "01",
        title: "Shape the pipeline",
        body: "Name your own pipeline stages and lead sources, and add the custom fields your team actually fills in.",
        visual: <PipelineVisual />,
    },
    {
        number: "02",
        title: "Bring in the team",
        body: "Invite agents, assign a role to each one, and leads start flowing to the right person automatically.",
        visual: <RoleVisual />,
    },
    {
        number: "03",
        title: "Work the deals",
        body: "Move deals across the board, leave a note and @mention a teammate, and watch the timeline fill in on its own.",
        visual: <NoteVisual />,
    },
];

export function StepsSection() {
    return (
        <section id="how-it-works" data-reveal className="mx-auto max-w-5xl px-6 py-24">
            <Eyebrow>How it works</Eyebrow>
            <Heading className="mt-3 max-w-lg text-[30px] leading-tight sm:text-[40px]">
                Set up in three steps, <span className="font-light">not three weeks</span>
            </Heading>

            <div className="mt-16 flex flex-col gap-16">
                {STEPS.map((step, index) => (
                    <div
                        key={step.number}
                        className={`flex flex-col items-center gap-10 lg:flex-row ${index % 2 === 1 ? "lg:flex-row-reverse" : ""}`}
                    >
                        <div className="flex-1">
                            <span className="font-(family-name:--font-aleo) text-5xl font-light text-[#4F46E5]/30">{step.number}</span>
                            <h3 className="mt-2 text-[22px] font-medium text-[#1c1c1c]">{step.title}</h3>
                            <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">{step.body}</p>
                        </div>
                        <div className="w-full flex-1">{step.visual}</div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function PipelineVisual() {
    const columns = [
        { name: "New", color: "#475569", deals: ["Acme Inc"] },
        { name: "Qualified", color: "#0284C7", deals: ["Globex Corp", "Initech"] },
        { name: "Won", color: "#059669", deals: ["Contoso"] },
    ];

    return (
        <div className="flex gap-3 overflow-x-auto rounded-xl border border-line bg-paper p-4">
            {columns.map((column) => (
                <div key={column.name} className="w-36 shrink-0">
                    <div className="mb-2">
                        <StageBadge name={column.name} color={column.color} />
                    </div>
                    <div className="flex flex-col gap-2">
                        {column.deals.map((title) => (
                            <div key={title} className="rounded-lg border border-line bg-white px-3 py-2.5 text-[13px] font-medium text-[#1c1c1c]">
                                {title}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function RoleVisual() {
    const rows = [
        { name: "Priya", role: "Manager", can: "Sees every lead" },
        { name: "Rahul", role: "Agent", can: "Sees only their own" },
        { name: "Meera", role: "Agent", can: "Sees only their own" },
    ];

    return (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
            {rows.map((row, index) => (
                <div
                    key={row.name}
                    className={`flex items-center gap-3 px-4 py-3 text-[13px] ${index !== rows.length - 1 ? "border-b border-line-light" : ""}`}
                >
                    <Avatar name={row.name} size="md" />
                    <span className="font-medium text-[#1c1c1c]">{row.name}</span>
                    <span className="rounded bg-paper px-1.5 text-muted">{row.role}</span>
                    <span className="ml-auto text-muted">{row.can}</span>
                </div>
            ))}
        </div>
    );
}

function NoteVisual() {
    return (
        <div className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-start gap-2.5">
                <Avatar name="Priya" size="md" />
                <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px]">
                        <span className="font-medium text-[#1c1c1c]">Priya</span>
                        <span className="text-light">2m ago</span>
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                        Budget&apos;s approved. <span className="font-medium text-[#4F46E5]">@Rahul</span> can you send the contract today?
                    </p>
                </div>
            </div>
        </div>
    );
}
