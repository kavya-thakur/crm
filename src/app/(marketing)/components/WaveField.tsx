"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

import { simplexNoise } from "./simplexNoise";

// A backdrop for the product page's hero and the landing page's pricing: a wide floor of violet ridge lines rolling like slow
// waves, seen from just above. The lines break into dashes in the troughs (the site's
// halftone look) and fade away into the distance. Where the pointer touches the floor,
// rings spread out from it like a stone dropped in water.

const RIDGES = 64;

const vertexShader = `
    uniform float uTime;
    uniform vec2 uPointer;
    uniform float uTouch;
    varying float vHeight;
    varying float vRow;
    varying float vDepth;
    ${simplexNoise}
    void main() {
        vec3 p = position;
        // a long slow roll, with a finer chop on top
        float height = snoise(vec3(p.x * 0.22, p.y * 0.32, uTime * 0.1)) * 0.6
            + snoise(vec3(p.x * 0.8, p.y * 0.8, uTime * 0.25)) * 0.12;
        // the rings around the pointer, dying away with distance
        float distance = length(p.xy - uPointer);
        height += sin(distance * 4.5 - uTime * 4.0) * exp(-distance * 0.7) * 0.25 * uTouch;
        p.z += height;
        vHeight = height;
        vRow = p.y;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        vDepth = -view.z;
        gl_Position = projectionMatrix * view;
    }
`;

const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uGlow;
    uniform float uRidges;
    uniform float uDepth;
    uniform float uCell;
    varying float vHeight;
    varying float vRow;
    varying float vDepth;
    void main() {
        // one thin line every so often across the floor, about the same width on screen near or far
        float row = vRow * uRidges / uDepth;
        float width = fwidth(row);
        float line = 1.0 - smoothstep(width * 0.5, width * 1.5, abs(fract(row) - 0.5));
        if (line < 0.05) discard;
        // crests are solid; lower down the line breaks into shorter dashes
        float tone = clamp(0.45 + vHeight * 1.2, 0.0, 1.0);
        if (tone < 0.95 && mod(gl_FragCoord.x, uCell) > uCell * tone) discard;
        float fade = smoothstep(16.0, 5.0, vDepth) * smoothstep(1.0, 3.0, vDepth);
        gl_FragColor = vec4(mix(uColor, uGlow, smoothstep(0.0, 0.55, vHeight)), line * fade);
    }
`;

export function WaveField({ className = "" }: { className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dpr = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(dpr);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        box.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 40);
        camera.position.set(0, 2.1, 6.5);
        camera.lookAt(0, 0, 0);

        // the floor: 18 wide, 14 deep, lying flat
        const depth = 14;
        const uniforms = {
            uTime: { value: 0 },
            uPointer: { value: new THREE.Vector2(0, 0) },
            uTouch: { value: 0 },
            uColor: { value: new THREE.Color("#b3abff") },
            uGlow: { value: new THREE.Color("#4a38f5") },
            uRidges: { value: RIDGES },
            uDepth: { value: depth },
            uCell: { value: 7 * dpr },
        };
        const floor = new THREE.Mesh(
            // enough points for smooth waves; more only costs speed
            new THREE.PlaneGeometry(18, depth, 220, 150),
            new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false }),
        );
        floor.rotation.x = -Math.PI / 2;
        const scene = new THREE.Scene().add(floor);

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
        });
        resizer.observe(box);

        // where the pointer meets the floor, in the floor's own coordinates
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        const goal = new THREE.Vector2();
        let touching = false;
        function onMove(event: PointerEvent) {
            const rect = box.getBoundingClientRect();
            ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
            raycaster.setFromCamera(ndc, camera);
            const hit = raycaster.intersectObject(floor)[0];
            touching = !!hit && event.clientY >= rect.top && event.clientY <= rect.bottom;
            if (hit) {
                const local = floor.worldToLocal(hit.point.clone());
                goal.set(local.x, local.y);
            }
        }
        window.addEventListener("pointermove", onMove, { passive: true });

        let frame = 0;
        function tick() {
            frame = requestAnimationFrame(tick);
            if (!still) uniforms.uTime.value += 0.016;
            uniforms.uPointer.value.lerp(goal, 0.08);
            uniforms.uTouch.value += ((touching && !still ? 1 : 0) - uniforms.uTouch.value) * 0.04;
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
            window.removeEventListener("pointermove", onMove);
            floor.geometry.dispose();
            floor.material.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return <div ref={boxRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
