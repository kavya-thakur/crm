"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

import { simplexNoise } from "./simplexNoise";

// The "listening" orb (the demo page, and the landing page's FAQ): a sphere whose surface ripples like a voice, drawn in the
// site's halftone bars. It leans toward the pointer, and stirs while someone types in the form
// or opens a question (the page bumps `energy`; it settles back down by itself).

// Every point of the sphere is pushed out along its direction by two layers of moving noise
// (a slow swell and a quicker shimmer), more when there's energy, plus a bump toward the
// pointer. The surface's new slope is found by moving two tiny steps sideways and seeing
// where those land, so the light falls on the ripples correctly.
const vertexShader = `
    uniform float uTime;
    uniform float uEnergy;
    uniform vec3 uPointer;
    varying vec3 vNormal;
    varying vec3 vPosition;
    ${simplexNoise}
    vec3 shape(vec3 dir) {
        float swell = snoise(dir * 1.3 + vec3(0.0, uTime * 0.25, 0.0));
        float shimmer = snoise(dir * 3.2 - vec3(uTime * 0.6)) * (0.25 + uEnergy * 0.45);
        float bump = pow(max(dot(dir, uPointer), 0.0), 5.0) * 0.14;
        return dir * (1.0 + (swell + shimmer) * (0.11 + uEnergy * 0.07) + bump);
    }
    void main() {
        vec3 dir = normalize(position);
        vec3 side = normalize(cross(dir, abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(dir, side);
        vec3 here = shape(dir);
        vec3 a = shape(normalize(dir + side * 0.01));
        vec3 b = shape(normalize(dir + up * 0.01));
        vec4 position4 = modelViewMatrix * vec4(here, 1.0);
        vPosition = position4.xyz;
        vNormal = normalize(normalMatrix * cross(a - here, b - here));
        gl_Position = projectionMatrix * position4;
    }
`;

// The site's printed look (as in Halftone3D): rows of bars, solid where it's lit, broken into
// shorter dashes as it darkens. The colour slides from violet to lilac toward the light.
const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uGlow;
    uniform vec3 uLight;
    uniform float uRow;
    varying vec3 vNormal;
    varying vec3 vPosition;
    void main() {
        vec3 normal = normalize(vNormal);
        float diffuse = max(dot(normal, normalize(uLight - vPosition)), 0.0);
        float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 3.0);
        float tone = clamp(0.04 + diffuse + rim * 0.3, 0.0, 1.0);
        if (mod(gl_FragCoord.y, uRow) > uRow * 0.5) discard;
        if (tone < 0.12) discard;
        if (tone < 0.96 && mod(gl_FragCoord.x, uRow) > uRow * tone) discard;
        gl_FragColor = vec4(mix(uColor, uGlow, smoothstep(0.55, 1.0, diffuse)), 1.0);
    }
`;

// `color` is the shadowed side and the rings, `glow` the lit side (lighter on a dark page)
export function Orb({ energy, color = "#4a38f5", glow = "#8f84ff", className = "" }: { energy: RefObject<number>; color?: string; glow?: string; className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dpr = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(dpr);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        box.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
        camera.position.z = 5;

        const uniforms = {
            uTime: { value: 0 },
            uEnergy: { value: 0 },
            uPointer: { value: new THREE.Vector3(0, 0, 1) },
            uColor: { value: new THREE.Color(color) },
            uGlow: { value: new THREE.Color(glow) },
            uLight: { value: new THREE.Vector3(-4, 3, 2) },
            uRow: { value: 5 * dpr },
        };
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 48), new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms }));

        // two dashed "signal" rings around it, tilted different ways
        const ringMaterial = new THREE.LineDashedMaterial({ color, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.45 });
        const rings = [
            { radius: 1.55, tilt: [1.2, 0.3, 0] },
            { radius: 1.8, tilt: [1.45, -0.5, 0.4] },
        ].map(({ radius, tilt }) => {
            const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(160)), ringMaterial);
            line.computeLineDistances();
            line.rotation.set(tilt[0], tilt[1], tilt[2]);
            return line;
        });

        const group = new THREE.Group().add(orb, ...rings);
        const scene = new THREE.Scene().add(group);

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
        });
        resizer.observe(box);

        // the pointer anywhere on the page, -1 to 1 each way from the orb's centre
        const pointer = new THREE.Vector2();
        function onMove(event: PointerEvent) {
            const rect = box.getBoundingClientRect();
            pointer.set(
                THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1.5, 1.5),
                THREE.MathUtils.clamp(-(((event.clientY - rect.top) / rect.height) * 2 - 1), -1.5, 1.5),
            );
        }
        window.addEventListener("pointermove", onMove, { passive: true });

        let frame = 0;
        const target = new THREE.Vector3();

        function tick() {
            frame = requestAnimationFrame(tick);
            if (!still) uniforms.uTime.value += 0.016;

            // a bump from typing eases in, then the page's energy decays back to calm
            uniforms.uEnergy.value += (energy.current - uniforms.uEnergy.value) * 0.08;
            energy.current *= 0.96;

            target.set(pointer.x * 0.8, pointer.y * 0.8, 1).normalize();
            uniforms.uPointer.value.lerp(target, 0.06);
            group.rotation.y += ((still ? 0 : pointer.x * 0.35) - group.rotation.y) * 0.05;
            group.rotation.x += ((still ? 0 : -pointer.y * 0.25) - group.rotation.x) * 0.05;
            rings[0].rotation.z += still ? 0 : 0.004 + uniforms.uEnergy.value * 0.02;
            rings[1].rotation.z -= still ? 0 : 0.003 + uniforms.uEnergy.value * 0.015;

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
            orb.geometry.dispose();
            orb.material.dispose();
            rings.forEach((ring) => ring.geometry.dispose());
            ringMaterial.dispose();
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [energy, color, glow]);

    return <div ref={boxRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
