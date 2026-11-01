import type { ComponentType } from "react";
import {
    IconAddressBook,
    IconCalendarEvent,
    IconChecklist,
    IconCurrencyRupee,
    IconNotes,
    IconPlus,
    IconShieldLock,
    IconTargetArrow,
    IconTimeline,
} from "@tabler/icons-react";

import { CONTAINER, PlusMark } from "./Eyebrow";

// Flash has no customers to show yet, so where twenty.com lists customer logos this
// strip lists what's in the box, drawn in the same quiet grey
const MODULES: { icon: ComponentType<{ size?: number; className?: string }>; label: string }[] = [
    { icon: IconTargetArrow, label: "Leads" },
    { icon: IconCurrencyRupee, label: "Deals" },
    { icon: IconAddressBook, label: "Contacts" },
    { icon: IconChecklist, label: "Tasks" },
    { icon: IconCalendarEvent, label: "Activities" },
    { icon: IconNotes, label: "Notes" },
    { icon: IconTimeline, label: "Timeline" },
    { icon: IconShieldLock, label: "Roles" },
];

const LABEL = "font-(family-name:--font-azeret-mono) text-[12px] font-medium whitespace-nowrap text-[#1c1c1c]/60 uppercase";

export function LogoBar() {
    return (
        <section data-reveal aria-label="What's included" className="bg-white py-16">
            <div className={CONTAINER}>
                <div className="relative flex min-h-18 items-stretch border border-[#1c1c1c]/10">
                    {/* blue crosses on the four corners of the frame */}
                    <PlusMark className="-top-1.5 -left-1.5" />
                    <PlusMark className="-top-1.5 -right-1.5" />
                    <PlusMark className="-bottom-1.5 -left-1.5" />
                    <PlusMark className="-right-1.5 -bottom-1.5" />

                    <div className="flex shrink-0 items-center border-r border-[#1c1c1c]/10 px-8">
                        <span className={LABEL}>Built in</span>
                    </div>

                    <ul className="flex min-w-0 flex-1 items-center justify-around gap-6 overflow-hidden px-6">
                        {MODULES.map((module, index) => (
                            <li
                                key={module.label}
                                // the last few drop out on narrower screens instead of squeezing
                                className={`items-center gap-1.5 font-(family-name:--font-host-grotesk) text-[17px] font-medium tracking-[-0.02em] text-[#1c1c1c]/40 ${index > 3 ? "hidden min-[1100px]:flex" : "flex"}`}
                            >
                                <module.icon size={18} />
                                {module.label}
                            </li>
                        ))}
                    </ul>

                    <div className="hidden shrink-0 items-center gap-2 border-l border-[#1c1c1c]/10 px-6 min-[921px]:flex">
                        <IconPlus size={14} className="text-[#1c1c1c]/60" />
                        <span className={LABEL}>Your own fields</span>
                    </div>
                </div>
            </div>
        </section>
    );
}
