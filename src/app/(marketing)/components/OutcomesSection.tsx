import { IconCheck } from "@tabler/icons-react";
import { Eyebrow, Heading } from "./Eyebrow";

// Real capabilities, not invented customer quotes — Flash doesn't have
// customers yet, so this replaces the testimonial slot honestly.
const OUTCOMES = [
    "A pipeline that matches how the team already sells, not a template to adapt to",
    "Every assignment, stage change and note recorded automatically on the record",
    "Roles that limit what each person can see, create or delete — no shared logins",
    "A single Notes feed showing everything tagged to you, across every lead, deal and contact",
];

export function OutcomesSection() {
    return (
        <section data-reveal className="border-t border-line py-24">
            <div className="mx-auto max-w-3xl px-6">
                <Eyebrow>What you get on day one</Eyebrow>
                <Heading className="mt-3 text-[30px] leading-tight sm:text-[36px]">
                    No ramp-up, <span className="font-light">just a pipeline that works</span>
                </Heading>

                <ul className="mt-10 flex flex-col gap-4">
                    {OUTCOMES.map((line) => (
                        <li key={line} className="flex items-start gap-3 text-[15px] text-[#1c1c1c]">
                            <IconCheck size={18} className="mt-0.5 shrink-0 text-[#4F46E5]" />
                            {line}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
