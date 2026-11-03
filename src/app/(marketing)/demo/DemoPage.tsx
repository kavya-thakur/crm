"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import gsap from "gsap";
import { IconArrowRight, IconCheck, IconCircleCheckFilled } from "@tabler/icons-react";

import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { CONTAINER, Eyebrow } from "../components/Eyebrow";
import { Orb } from "../components/Orb";

const TEAM_SIZES = ["Just me", "2–5", "6–20", "21–50", "50+"];
const INTERESTS = ["Moving off spreadsheets", "Managing a sales team", "Tracking deals", "Something else"];

const MONO = "font-(family-name:--font-azeret-mono)";
const SANS = "font-(family-name:--font-host-grotesk)";

type Field = "firstName" | "lastName" | "email" | "company" | "phone" | "message";
type Values = Record<Field, string>;

const EMPTY: Values = { firstName: "", lastName: "", email: "", company: "", phone: "", message: "" };

// What's wrong with the form before it's sent; the server checks again either way
function check(values: Values) {
    const errors: Partial<Record<Field, string>> = {};
    if (!values.firstName.trim()) errors.firstName = "Your first name, please";
    if (!values.lastName.trim()) errors.lastName = "And your last name";
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) errors.email = "A work email we can reply to";
    if (!values.company.trim()) errors.company = "Where you work";
    const digits = values.phone.replace(/\D/g, "").length;
    if (digits < 5 || digits > 15) errors.phone = "A number we can call you on";
    return errors;
}

// /demo: "See Flash in action". The request lands in Flash's own workspace as a lead,
// through the same web form feature customers put on their websites.
export default function DemoPage({ loggedIn, formKey }: { loggedIn: boolean; formKey: string | null }) {
    const rootRef = useRef<HTMLDivElement>(null);
    // how stirred up the orb is: typing nudges it, sending the request sets it ringing
    const energy = useRef(0);

    // the copy and the form card settle in once, when the page opens
    useLayoutEffect(() => {
        const media = gsap.matchMedia();
        media.add("(prefers-reduced-motion: no-preference)", () => {
            gsap.from(rootRef.current!.querySelectorAll("[data-rise]"), { opacity: 0, y: 18, duration: 0.6, ease: "power3.out", stagger: 0.08 });
        });
        return () => media.revert();
    }, []);

    return (
        <div ref={rootRef} className="bg-[#f4f4f4] text-[#1c1c1c]">
            <Nav loggedIn={loggedIn} primaryHref={loggedIn ? "/dashboard" : "/register"} primaryLabel={loggedIn ? "Go to your workspace" : "Get started"} />

            <main className="relative overflow-clip">
                {/* thin rounded outlines behind the page, like ruled paper */}
                <div aria-hidden className="pointer-events-none absolute top-10 -left-10 h-70 w-[46%] rounded-[32px] border border-[#1c1c1c]/8" />
                <div aria-hidden className="pointer-events-none absolute top-28 right-[-6%] h-72 w-[42%] rounded-[32px] border border-[#1c1c1c]/8" />

                <div className={`${CONTAINER} relative grid gap-12 pt-14 pb-24 min-[921px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[921px]:gap-20 min-[921px]:pt-24`}>
                    <div className="relative min-[921px]:pt-4">
                        <div data-rise>
                            <Eyebrow>Book a demo</Eyebrow>
                        </div>
                        <h1
                            data-rise
                            className="mt-6 font-(family-name:--font-aleo) text-[clamp(2.75rem,1.6rem+4vw,4.5rem)] leading-[1.02] font-light tracking-[-0.03em]"
                        >
                            See Flash
                            <br />
                            <span className={`${SANS} tracking-[-0.05em]`}>
                                in <span className="text-[#4a38f5]">action</span>
                            </span>
                        </h1>
                        <p data-rise className={`${SANS} mt-6 max-w-110 text-[17px] leading-[1.55] text-[#1c1c1c]/60`}>
                            A 30-minute walkthrough with someone from our team, shaped around how you sell. Bring your questions, and your messiest
                            spreadsheet.
                        </p>

                        <ul data-rise className={`${SANS} mt-10 flex flex-col gap-4 text-[15px]`}>
                            {[
                                "Your own pipeline, set up live while we talk",
                                "How teams move off spreadsheets in a day",
                                "A plan that fits your team size, with no pressure",
                            ].map((point) => (
                                <li key={point} className="flex items-start gap-3">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#4a38f5]/10 text-[#4a38f5]">
                                        <IconCheck size={12} stroke={3} />
                                    </span>
                                    {point}
                                </li>
                            ))}
                        </ul>

                        {/* on desktop it floats in the gap between the text and the form; on phones it sits in line */}
                        <div data-rise className="-mx-6 mt-2 h-75 min-[921px]:absolute min-[921px]:top-80 min-[921px]:-right-18 min-[921px]:m-0 min-[921px]:size-100">
                            <Orb energy={energy} className="h-full w-full" />
                        </div>

                        <p data-rise className={`${MONO} text-[11px] tracking-wide text-[#1c1c1c]/45 uppercase min-[921px]:mt-12`}>
                            We usually reply within one working day
                        </p>
                    </div>

                    <div data-rise>
                        <DemoForm formKey={formKey} onStir={(amount) => (energy.current = Math.max(energy.current, Math.min(amount >= 2 ? 2 : 1, energy.current + amount)))} />
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}

function DemoForm({ formKey, onStir }: { formKey: string | null; onStir: (amount: number) => void }) {
    const [values, setValues] = useState<Values>(EMPTY);
    const [teamSize, setTeamSize] = useState<string | null>(null);
    const [interest, setInterest] = useState<string | null>(null);
    const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
    // the spam trap: people never see this field, so only bots fill it in
    const [trap, setTrap] = useState("");
    const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
    const [problem, setProblem] = useState<string | null>(null);

    function set(field: Field, value: string) {
        setValues((current) => ({ ...current, [field]: value }));
        onStir(0.25);
        if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        const found = check(values);
        setErrors(found);
        setProblem(null);
        if (Object.keys(found).length > 0) return;

        if (!formKey) {
            setProblem("Demo requests aren't switched on yet. Please email us instead.");
            return;
        }

        setState("sending");
        try {
            const res = await fetch(`/api/public/forms/${formKey}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    name: `${values.firstName.trim()} ${values.lastName.trim()}`,
                    email: values.email.trim(),
                    phone: values.phone.trim(),
                    company: values.company.trim(),
                    message: values.message.trim() || undefined,
                    details: { ...(teamSize && { "Team size": teamSize }), ...(interest && { "Looking for": interest }) },
                    website: trap,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.message ?? "Something went wrong. Please try again.");
            onStir(2);
            setState("sent");
        } catch (error) {
            setProblem(error instanceof Error ? error.message : "Something went wrong. Please try again.");
            setState("idle");
        }
    }

    if (state === "sent") return <Thanks name={values.firstName.trim()} email={values.email.trim()} />;

    return (
        <form
            noValidate
            onSubmit={submit}
            className="rounded-[28px] border border-[#1c1c1c]/8 bg-white/85 p-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-28px_rgb(28_28_28/0.25)] backdrop-blur-sm min-[921px]:p-10"
        >
            <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
                <Line label="Work email" required error={errors.email} className="sm:col-span-2">
                    <input type="email" autoComplete="email" value={values.email} aria-invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
                </Line>
                <Line label="First name" required error={errors.firstName}>
                    <input autoComplete="given-name" value={values.firstName} aria-invalid={!!errors.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputClass} />
                </Line>
                <Line label="Last name" required error={errors.lastName}>
                    <input autoComplete="family-name" value={values.lastName} aria-invalid={!!errors.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputClass} />
                </Line>
                <Line label="Company" required error={errors.company}>
                    <input autoComplete="organization" value={values.company} aria-invalid={!!errors.company} onChange={(e) => set("company", e.target.value)} className={inputClass} />
                </Line>
                <Line label="Phone" required error={errors.phone}>
                    <input type="tel" autoComplete="tel" value={values.phone} aria-invalid={!!errors.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
                </Line>
            </div>

            <Choices label="Team size" options={TEAM_SIZES} value={teamSize} onChange={(size) => {
                setTeamSize(size);
                onStir(0.6);
            }} />
            <Choices label="What are you looking for?" options={INTERESTS} value={interest} onChange={(choice) => {
                setInterest(choice);
                onStir(0.6);
            }} />

            <Line label="How can we help?" className="mt-7">
                <textarea
                    rows={2}
                    value={values.message}
                    onChange={(e) => set("message", e.target.value)}
                    className={`${inputClass} resize-none py-2 leading-6`}
                />
            </Line>

            {/* the spam trap, hidden from people and from screen readers */}
            <input
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
                className="absolute h-0 w-0 opacity-0"
            />

            {problem && (
                <p role="alert" className={`${SANS} mt-6 rounded-xl bg-[#fdebe8] px-4 py-3 text-[14px] text-[#c4493d]`}>
                    {problem}
                </p>
            )}

            <button
                type="submit"
                disabled={state === "sending"}
                className={`${SANS} group mt-8 flex h-13 w-full items-center justify-between rounded-full bg-[#1c1c1c] pr-2 pl-6 text-[16px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#333333] disabled:opacity-70`}
            >
                {state === "sending" ? "Sending…" : "Book my demo"}
                <span className="flex size-9 items-center justify-center rounded-full bg-[#4a38f5]">
                    <IconArrowRight size={17} className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-rotate-45" />
                </span>
            </button>

            <p className={`${SANS} mt-4 text-center text-[13px] text-[#1c1c1c]/45`}>We&apos;ll only use your details to set up the demo.</p>
        </form>
    );
}

// an underline instead of a box, turning violet while you type in it
const inputClass = `${SANS} block w-full border-0 border-b border-[#1c1c1c]/15 bg-transparent px-0 pb-2 text-[16px] outline-none transition-colors focus:border-[#4a38f5] aria-invalid:border-[#c4493d]`;

// One field: a small mono label over an underlined input, and what's wrong with it, if anything
function Line({ label, required, error, className = "", children }: { label: string; required?: boolean; error?: string; className?: string; children: ReactNode }) {
    return (
        <label className={`block ${className}`}>
            <span className={`${MONO} mb-2 block text-[11px] tracking-wide text-[#1c1c1c]/50 uppercase`}>
                {label}
                {required && <span className="text-[#4a38f5]"> *</span>}
            </span>
            {children}
            {error && <span className={`${SANS} mt-1.5 block text-[13px] text-[#c4493d]`}>{error}</span>}
        </label>
    );
}

// A row of pills to pick one from; picking the picked one again un-picks it
function Choices({ label, options, value, onChange }: { label: string; options: string[]; value: string | null; onChange: (value: string | null) => void }) {
    return (
        <fieldset className="mt-8">
            <legend className={`${MONO} mb-3 text-[11px] tracking-wide text-[#1c1c1c]/50 uppercase`}>{label}</legend>
            <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                    const picked = option === value;
                    return (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={picked}
                            onClick={() => onChange(picked ? null : option)}
                            className={`${SANS} h-9 rounded-full border px-4 text-[14px] transition-colors ${
                                picked ? "border-[#4a38f5] bg-[#4a38f5] text-white" : "border-[#1c1c1c]/12 bg-white text-[#1c1c1c]/75 hover:border-[#1c1c1c]/30"
                            }`}
                        >
                            {option}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

// After sending: a check that pops in, and what happens next
function Thanks({ name, email }: { name: string; email: string }) {
    const iconRef = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const media = gsap.matchMedia();
        media.add("(prefers-reduced-motion: no-preference)", () => {
            gsap.from(iconRef.current, { scale: 0.4, opacity: 0, duration: 0.5, ease: "back.out(2.2)" });
        });
        return () => media.revert();
    }, []);

    return (
        <div className="rounded-[28px] border border-[#1c1c1c]/8 bg-white/85 p-10 text-center shadow-[0_24px_60px_-28px_rgb(28_28_28/0.25)] min-[921px]:p-14">
            <span ref={iconRef} className="inline-flex text-[#4a38f5]">
                <IconCircleCheckFilled size={56} />
            </span>
            <h2 className="mt-6 font-(family-name:--font-aleo) text-[34px] leading-tight font-light tracking-[-0.02em]">Thanks, {name}!</h2>
            <p className={`${SANS} mx-auto mt-3 max-w-90 text-[16px] leading-[1.55] text-[#1c1c1c]/60`}>
                Your request is in. Someone from our team will reach out at <span className="text-[#1c1c1c]">{email}</span> within one working day.
            </p>
            <Link href="/" className={`${SANS} mt-8 inline-flex h-10 items-center rounded-full border border-[#1c1c1c]/15 px-5 text-[14px] font-medium hover:bg-[#1c1c1c]/5`}>
                Back to the home page
            </Link>
        </div>
    );
}
