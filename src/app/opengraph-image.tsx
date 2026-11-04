import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { IconCircleCheckFilled } from "@tabler/icons-react";

// The picture that shows up when someone shares a Flash link (WhatsApp, LinkedIn, X, Slack).
// Built once at build time. The fonts are .ttf files because the image renderer can't read woff2.
export const alt = "Flash: every lead, every deal, closed in a flash";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));

// One update card floats over the screenshot, where the two halves meet
const CARD = { title: "Deal won · ₹4,80,000", detail: "Hooli Cloud moved to Won" };

export default async function Image() {
    const [aleo, grotesk, groteskBold, shot] = await Promise.all([
        font("Aleo-Light.ttf"),
        font("HostGrotesk-Regular.ttf"),
        font("HostGrotesk-SemiBold.ttf"),
        // the same dashboard screenshot as the product page (2880 × 1800)
        readFile(join(process.cwd(), "public/product/dashboard.jpg")),
    ]);

    return new ImageResponse(
        (
            <div style={{ display: "flex", width: "100%", height: "100%", background: "#ffffff", fontFamily: "Host Grotesk", color: "#1c1c1c" }}>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, padding: "64px 0 64px 72px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <svg width="52" height="52" viewBox="0 0 64 64">
                            <rect width="64" height="64" rx="16" fill="#1c1c1c" />
                            <path d="M20 15 H50 L47 24 H17 Z" fill="#8f84ff" />
                            <path d="M17 28 H40 L37 37 H14 Z" fill="#b3abff" />
                            <path d="M14 41 H26 L23 50 H11 Z" fill="#ffffff" />
                        </svg>
                        <span style={{ fontWeight: 600, fontSize: 36, letterSpacing: -1.6 }}>Flash</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", fontFamily: "Aleo", fontSize: 74, lineHeight: 1.05, letterSpacing: -2.2 }}>
                        <span>Every lead,</span>
                        <span>every deal,</span>
                        <span style={{ fontFamily: "Host Grotesk", letterSpacing: -3.6 }}>
                            closed in a&nbsp;<span style={{ color: "#4a38f5" }}>flash</span>
                        </span>
                    </div>

                    <span style={{ fontSize: 26, color: "rgba(28,28,28,0.55)", letterSpacing: -0.4 }}>The CRM for sales teams</span>
                </div>

                {/* violet panel, the real dashboard running off its edge */}
                <div
                    style={{
                        display: "flex",
                        position: "absolute",
                        top: 24,
                        right: 24,
                        bottom: 24,
                        left: 640,
                        overflow: "hidden",
                        borderRadius: 32,
                        backgroundColor: "#4a38f5",
                        backgroundImage: "radial-gradient(circle at 90% 0%, #8f84ff 0%, rgba(143,132,255,0) 70%)",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            position: "absolute",
                            top: 64,
                            left: 56,
                            width: 720,
                            height: 640,
                            overflow: "hidden",
                            borderRadius: 18,
                            background: "#ffffff",
                            border: "6px solid rgba(255,255,255,0.35)",
                            boxShadow: "0 30px 80px rgba(20,10,90,0.45)",
                        }}
                    >
                        {/* shown 1100 wide and shifted left past the app's sidebar, so the numbers lead */}
                        <img src={`data:image/jpeg;base64,${shot.toString("base64")}`} width={1100} height={688} alt="" style={{ position: "absolute", top: -6, left: -172 }} />
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        position: "absolute",
                        left: 560,
                        bottom: 64,
                        alignItems: "center",
                        gap: 16,
                        padding: "16px 24px 16px 16px",
                        borderRadius: 20,
                        border: "1px solid #ebebeb",
                        background: "#ffffff",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 14, background: "#e6f6eb" }}>
                        <IconCircleCheckFilled size={26} color="#218358" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, fontSize: 21, letterSpacing: -0.4 }}>{CARD.title}</span>
                        <span style={{ fontSize: 18, color: "rgba(28,28,28,0.55)" }}>{CARD.detail}</span>
                    </div>
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
