import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { IconCalendarEvent, IconCircleCheckFilled, IconUserCheck } from "@tabler/icons-react";

// The picture that shows up when someone shares a Flash link (WhatsApp, LinkedIn, X, Slack).
// Built once at build time. The fonts are .ttf files because the image renderer can't read woff2.
export const alt = "Flash: every lead, every deal, closed in a flash";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

// The same cards that float beside the login form
const CARDS = [
    { icon: <IconUserCheck size={26} color="#3e63dd" />, tint: "#edf2fe", title: "Lead assigned", detail: "Acme Industries → Priya", shift: -36 },
    { icon: <IconCalendarEvent size={26} color="#ab6400" />, tint: "#fff4d5", title: "Call scheduled", detail: "Contoso Ltd · Tue 11:00", shift: 36 },
    { icon: <IconCircleCheckFilled size={26} color="#218358" />, tint: "#e6f6eb", title: "Deal won · ₹4,80,000", detail: "Hooli Cloud moved to Won", shift: -12 },
];

export default async function Image() {
    const [aleo, grotesk, groteskBold] = await Promise.all([font("Aleo-Light.ttf"), font("HostGrotesk-Regular.ttf"), font("HostGrotesk-SemiBold.ttf")]);

    return new ImageResponse(
        (
            <div style={{ display: "flex", width: "100%", height: "100%", background: "#ffffff", padding: 24, fontFamily: "Host Grotesk", color: "#1c1c1c" }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, padding: "40px 32px 40px 48px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <svg width="52" height="52" viewBox="0 0 64 64">
                            <rect width="64" height="64" rx="16" fill="#1c1c1c" />
                            <path d="M20 15 H50 L47 24 H17 Z" fill="#8f84ff" />
                            <path d="M17 28 H40 L37 37 H14 Z" fill="#b3abff" />
                            <path d="M14 41 H26 L23 50 H11 Z" fill="#ffffff" />
                        </svg>
                        <span style={{ fontWeight: 600, fontSize: 36, letterSpacing: -1.6 }}>Flash</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Aleo", fontSize: 76, lineHeight: 1.05, letterSpacing: -2.2 }}>
                        <span>Every lead,</span>
                        <span>every deal,</span>
                        <span style={{ fontFamily: "Host Grotesk", letterSpacing: -3.6 }}>
                            closed in a&nbsp;<span style={{ color: "#4a38f5" }}>flash</span>
                        </span>
                    </div>

                    <span style={{ maxWidth: 470, fontSize: 26, lineHeight: 1.35, color: "rgba(28,28,28,0.55)", letterSpacing: -0.4 }}>The CRM that keeps up with how fast your team sells.</span>
                </div>

                <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, borderRadius: 32, background: "#f4f4f4" }}>
                    {CARDS.map((card) => (
                        <div
                            key={card.title}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 16,
                                width: 380,
                                padding: 16,
                                borderRadius: 20,
                                border: "1px solid #ebebeb",
                                background: "#ffffff",
                                boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
                                transform: `translateX(${card.shift}px)`,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 14, background: card.tint }}>{card.icon}</div>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontWeight: 600, fontSize: 21, letterSpacing: -0.4 }}>{card.title}</span>
                                <span style={{ fontSize: 18, color: "rgba(28,28,28,0.55)" }}>{card.detail}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ),
        {
            ...size,
            fonts: [
                { name: "Aleo", data: aleo, weight: 300, style: "normal" },
                { name: "Host Grotesk", data: grotesk, weight: 400, style: "normal" },
                { name: "Host Grotesk", data: groteskBold, weight: 600, style: "normal" },
            ],
        },
    );
}
