"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// The pricing section's picture (landing page and /pricing): a stage light above the section shines soft violet rays
// down onto one plan card (Team, the one we recommend), with dust drifting in the beam and a glow
// round the card. Hover another plan and the light swings over to it.
//
// It's all drawn by one shader over the whole section. Each frame the lit card's place is
// measured, and every pixel works out how far it is from the line between the light and the card.

const fragmentShader = `
    uniform vec2 uSize;
    uniform float uDpr;
    uniform float uTime;
    uniform vec2 uSource;
    uniform vec4 uCard; // centre x, centre y, half width, half height, in CSS pixels from the top left
    uniform vec3 uLight;
    uniform vec3 uDust;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
        vec2 p = vec2(gl_FragCoord.x, uSize.y * uDpr - gl_FragCoord.y) / uDpr;

        // the beam: a cone from the light towards the card, as wide as the card when it gets there
        vec2 axis = normalize(uCard.xy - uSource);
        vec2 toPixel = p - uSource;
        float dist = length(toPixel);
        vec2 dir = toPixel / dist;
        float angle = atan(axis.x * dir.y - axis.y * dir.x, dot(axis, dir));
        float spread = atan(uCard.z * 1.05, distance(uSource, uCard.xy));
        float cone = smoothstep(spread, spread * 0.45, abs(angle));
        // slow streaks along it, like light through haze
        float streaks = 0.6 + 0.22 * sin(angle * 90.0 + uTime * 0.4) + 0.18 * sin(angle * 37.0 - uTime * 0.27);
        float reach = distance(uSource, uCard.xy);
        float fade = smoothstep(0.0, 160.0, dist) * (1.0 - smoothstep(reach * 0.85, reach * 1.3, dist));
        float beam = cone * streaks * fade;

        // a glow just outside the card's rounded edge, fading from its lit top to its bottom
        vec2 q = abs(p - uCard.xy) - uCard.zw + 24.0;
        float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 24.0;
        float halo = exp(-max(edge, 0.0) / 44.0) * mix(0.35, 0.8, smoothstep(uCard.y, uCard.y - uCard.w, p.y));

        // dust: one speck per 46px square, floating slowly, only seen inside the beam
        vec2 cellPos = p + vec2(0.0, -uTime * 9.0);
        vec2 cell = floor(cellPos / 46.0);
        float seed = hash(cell);
        vec2 speck = (0.2 + 0.6 * vec2(seed, hash(cell + 7.0))) * 46.0 + 6.0 * vec2(sin(uTime * 0.5 + seed * 6.3), cos(uTime * 0.4 + seed * 4.1));
        float fleck = smoothstep(1.8, 0.6, length(mod(cellPos, 46.0) - speck)) * step(0.45, seed);
        float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + seed * 2.0) + seed * 20.0);
        float dust = fleck * twinkle * cone * fade;

        float alpha = clamp(beam * 0.5 + halo * 0.5, 0.0, 1.0);
        vec3 color = mix(uLight, uDust, dust);
        alpha = max(alpha, dust * 0.9);
        // premultiplied, as the page expects
        gl_FragColor = vec4(color * alpha, alpha);
    }
`;

export function Spotlight({ lit, className = "" }: { lit: number; className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const goal = useRef(lit);

    useEffect(() => {
        goal.current = lit;
    }, [lit]);

    useEffect(() => {
        const box = boxRef.current!;
        // the cards sit beside this box in the pricing section
        const cards = box.parentElement!.querySelectorAll<HTMLElement>("[data-plan]");
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        // a soft picture, so it doesn't need every pixel of a Retina screen
        const dpr = Math.min(window.devicePixelRatio, 1.5);

        const renderer = new THREE.WebGLRenderer({ alpha: true, premultipliedAlpha: true });
        renderer.setPixelRatio(dpr);
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        box.append(renderer.domElement);

        const uniforms = {
            uSize: { value: new THREE.Vector2() },
            uDpr: { value: dpr },
            uTime: { value: 0 },
            uSource: { value: new THREE.Vector2() },
            uCard: { value: new THREE.Vector4() },
            uLight: { value: new THREE.Color("#a79eff") },
            uDust: { value: new THREE.Color("#4a38f5") },
        };
        // one square over the whole canvas; the shader draws everything on it
        const material = new THREE.ShaderMaterial({
            vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
            fragmentShader,
            uniforms,
            transparent: true,
            premultipliedAlpha: true,
        });
        const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
        const camera = new THREE.Camera();

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            uniforms.uSize.value.set(width, height);
        });
        resizer.observe(box);

        // where the light points, eased towards the lit card so it swings rather than jumps
        let aim: { x: number; y: number; w: number; h: number } | null = null;
        let frame = 0;

        function tick() {
            frame = requestAnimationFrame(tick);
            // measured every frame: the cards rise in on scroll and move when the page resizes
            const area = box.getBoundingClientRect();
            const card = cards[goal.current]?.getBoundingClientRect();
            if (!card) return;
            const target = { x: card.left - area.left + card.width / 2, y: card.top - area.top + card.height / 2, w: card.width / 2, h: card.height / 2 };
            if (!aim || still) aim = target;
            for (const key of ["x", "y", "w", "h"] as const) aim[key] += (target[key] - aim[key]) * 0.07;

            uniforms.uCard.value.set(aim.x, aim.y, aim.w, aim.h);
            // the light hangs above the middle of the section, just out of sight
            uniforms.uSource.value.set(area.width / 2, -120);
            if (!still) uniforms.uTime.value += 0.016;
            renderer.render(scene, camera);
        }

        // only drawn while it's on screen
        const watcher = new IntersectionObserver(([entry]) => {
            cancelAnimationFrame(frame);
            if (entry.isIntersecting) tick();
        });
        watcher.observe(box);

        return () => {
            cancelAnimationFrame(frame);
            watcher.disconnect();
            resizer.disconnect();
            material.dispose();
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return <div ref={boxRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
