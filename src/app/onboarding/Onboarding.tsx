"use client";

// First-run setup after sign up: workspace name, your name, currency. The last step saves all
// three (/api/onboarding), then the welcome plays and the dashboard opens.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import { LogoMark } from "@/components/Logo";
import { api } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/utils/format";

import Scene, { type SceneControls } from "./Scene";

gsap.registerPlugin(useGSAP, SplitText);

const STEPS = [
    { title: "Create your workspace", hint: "Use the name your team already knows." },
    { title: "Tell us your name", hint: "This is how teammates will see you on leads and deals." },
    { title: "Pick your currency", hint: "Deal values and reports show in it. You can change it later in Settings." },
];

const GRAIN =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function Onboarding() {
    const router = useRouter();
    const root = useRef<HTMLElement>(null);
    const ctl = useRef<SceneControls>({ light: 0, turn: 0, drift: 0, center: 0 });
    const busy = useRef(false);
    const [ready, setReady] = useState(false);
    const [step, setStep] = useState(0);
    const [workspace, setWorkspace] = useState("");
    const [name, setName] = useState("");
    const [currency, setCurrency] = useState("INR");
    const valid = [workspace.trim(), name.trim(), currency][step];

    const finish = useMutation({
        mutationFn: () => api.post("/onboarding", { workspaceName: workspace, name, currency }),
        onSuccess: () => go(3),
    });
    const finishError = axios.isAxiosError(finish.error) ? finish.error.response?.data?.message : null;

    // Intro: the studio lights slowly come up on the bolt, then the form fades in
    useGSAP(
        () => {
            gsap.timeline({ delay: 0.3 })
                .to(ctl.current, { light: 1, duration: 2.6, ease: "power2.inOut" })
                .call(() => setReady(true), [], 1)
                .from(".ob-chrome", { opacity: 0, duration: 1.4, ease: "power2.out" }, 1.2);
        },
        { scope: root },
    );

    // Leave the current step: text slides away, the bolt turns a little, the dust drifts faster
    const go = (next: number) => {
        if (busy.current) return;
        busy.current = true;
        const $ = gsap.utils.selector(root.current);
        gsap.to(ctl.current, { turn: `+=${next > step ? 0.6 : -0.6}`, duration: 1.8, ease: "power3.inOut" });
        gsap.timeline({
            onComplete: () => {
                busy.current = false;
                setStep(next);
            },
        })
            .to($(".ob-line"), { yPercent: -100, duration: 0.5, ease: "power3.in" })
            .to($(".ob-fade"), { opacity: 0, y: -8, duration: 0.4, stagger: 0.03, ease: "power2.in" }, 0)
            .to(ctl.current, { drift: 1, duration: 0.6, ease: "power2.in" }, 0);
    };

    // Enter the current step
    useGSAP(
        () => {
            if (!ready) return;
            gsap.to(ctl.current, { drift: 0, duration: 1.8, ease: "power2.out" });

            if (step < 3) {
                const split = SplitText.create(".ob-title", { type: "lines", mask: "lines", linesClass: "ob-line" });
                gsap.timeline()
                    .from(split.lines, { yPercent: 100, duration: 1.1, stagger: 0.08, ease: "power4.out" })
                    .from(".ob-fade", { y: 12, opacity: 0, duration: 0.9, stagger: 0.07, ease: "power3.out" }, 0.15)
                    .call(() => root.current?.querySelector("input")?.focus(), [], 0.4);
                return;
            }

            // Welcome: bolt rises to the middle, lights swell, title rises word by word,
            // then the lights go down and the app's background fades in
            const split = SplitText.create(".ob-wtitle", { type: "words", mask: "words" });
            // came from "Buy Pro": on to Billing to pay; otherwise into the app, on the trial
            const next = new URLSearchParams(window.location.search).get("plan") === "pro" ? "/settings/billing" : "/dashboard";
            gsap.timeline({ onComplete: () => router.replace(next) })
                .to(ctl.current, { center: 1, duration: 2.4, ease: "power3.inOut" }, 0)
                .to(ctl.current, { light: 1.5, duration: 2.4, ease: "power2.inOut" }, 0)
                .from(".ob-wtag", { opacity: 0, y: 8, duration: 1, ease: "power3.out" }, 0.9)
                .from(split.words, { yPercent: 100, duration: 1.2, stagger: 0.07, ease: "power4.out" }, 1.1)
                .from(".ob-wsub", { opacity: 0, y: 8, duration: 1, ease: "power3.out" }, 1.6)
                .to(ctl.current, { light: 0, drift: 1, duration: 1.2, ease: "power2.inOut" }, "+=1.4")
                .to(".ob-end", { opacity: 1, duration: 1.2, ease: "power2.inOut" }, "<0.2");
        },
        { scope: root, dependencies: [step, ready] },
    );

    return (
        <main ref={root} className="relative min-h-screen flex-1 overflow-hidden bg-[#08080a] text-white selection:bg-accent/40">
            <Scene ctl={ctl} />

            {/* keep the form readable over the scene, plus a little film grain */}
            <div className="pointer-events-none fixed inset-0 bg-[#08080a]/60 md:bg-transparent md:bg-linear-to-r md:from-[#08080a] md:via-[#08080a]/50 md:via-35% md:to-transparent md:to-60%" />
            <div className="pointer-events-none fixed inset-0 opacity-[0.04]" style={{ backgroundImage: GRAIN }} />

            <header className="ob-chrome fixed inset-x-0 top-0 z-20 flex items-center px-6 py-6 md:px-10">
                <span className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.04em]">
                    <LogoMark size={24} dark />
                    Flash
                </span>
            </header>

            <section className={`relative z-10 flex min-h-screen items-center px-6 py-28 md:px-[9vw] ${step === 3 ? "justify-center" : ""}`}>
                {ready && step < 3 && (
                    <form
                        key={step}
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!valid || finish.isPending) return;
                            if (step < 2) go(step + 1);
                            else finish.mutate();
                        }}
                        className="w-full max-w-[400px]"
                    >
                        <div className="ob-fade flex items-center gap-3">
                            <div className="flex gap-1">
                                {STEPS.map((_, i) => (
                                    <span key={i} className={`h-0.5 w-6 rounded-full ${i <= step ? "bg-white" : "bg-white/15"}`} />
                                ))}
                            </div>
                            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/40">Step {step + 1} of 3</span>
                        </div>

                        <h1 className="ob-title mt-8 font-display text-[clamp(34px,3.6vw,48px)] font-medium leading-[1.08] tracking-[-0.03em]">
                            {STEPS[step].title}
                        </h1>
                        <p className="ob-fade mt-3 text-[15px] leading-relaxed text-white/50">{STEPS[step].hint}</p>

                        {step < 2 ? (
                            <div className="ob-fade mt-10">
                                <label htmlFor="ob-input" className="mb-2 block text-[13px] text-white/60">
                                    {step === 0 ? "Workspace name" : "Full name"}
                                </label>
                                <input
                                    id="ob-input"
                                    value={step === 0 ? workspace : name}
                                    onChange={(e) => (step === 0 ? setWorkspace : setName)(e.target.value)}
                                    placeholder={step === 0 ? "Acme Inc." : "Jane Doe"}
                                    autoComplete={step === 0 ? "organization" : "name"}
                                    className="h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[15px] text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-white/25 focus:border-accent focus:ring-4 focus:ring-accent/25"
                                />
                            </div>
                        ) : (
                            <div
                                role="radiogroup"
                                aria-label="Currency"
                                className="ob-fade mt-10 max-h-66 overflow-y-auto rounded-xl border border-white/10 [scrollbar-color:rgb(255_255_255/0.15)_transparent] [scrollbar-width:thin]"
                            >
                                {CURRENCIES.map((c) => (
                                    <button
                                        key={c.code}
                                        type="button"
                                        role="radio"
                                        aria-checked={currency === c.code}
                                        onClick={() => setCurrency(c.code)}
                                        className={`flex w-full items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-left transition-colors last:border-b-0 ${
                                            currency === c.code ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                                        }`}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className="w-9 font-mono text-[12px] text-white/45">{c.code}</span>
                                            <span className="text-[15px] text-white">{c.name}</span>
                                        </span>
                                        <span
                                            className={`flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                                currency === c.code ? "border-accent bg-accent" : "border-white/20"
                                            }`}
                                        >
                                            {currency === c.code && <IconCheck size={12} stroke={3} />}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="ob-fade mt-8 flex items-center gap-2">
                            <button
                                type="submit"
                                disabled={!valid || finish.isPending}
                                className="group inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-[14px] font-medium text-black transition-[background-color,opacity] hover:bg-white/90 disabled:opacity-30"
                            >
                                {step < 2 ? "Continue" : finish.isPending ? "Setting up..." : "Finish setup"}
                                <IconArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                            </button>
                            {step > 0 && !finish.isPending && (
                                <button type="button" onClick={() => go(step - 1)} className="h-11 px-3 text-[14px] text-white/50 transition-colors hover:text-white">
                                    Back
                                </button>
                            )}
                        </div>

                        {finish.isError && (
                            <p role="alert" className="mt-4 text-[14px] text-[#ff8b8e]">
                                {finishError ?? "Something went wrong. Please try again."}
                            </p>
                        )}
                    </form>
                )}

                {step === 3 && (
                    <div className="mt-[34vh] text-center">
                        <p className="ob-wtag font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">{workspace.trim()}</p>
                        <h1 className="ob-wtitle mt-5 font-display text-[clamp(40px,5vw,68px)] font-medium leading-[1.05] tracking-[-0.035em]">
                            Welcome to Flash, {name.trim().split(/\s+/)[0]}
                        </h1>
                        <p className="ob-wsub mt-4 text-[15px] text-white/50">Your workspace is ready.</p>
                    </div>
                )}
            </section>

            {/* fades to the app's own background colour before the dashboard loads */}
            <div className="ob-end pointer-events-none fixed inset-0 z-50 bg-app opacity-0" />
        </main>
    );
}
