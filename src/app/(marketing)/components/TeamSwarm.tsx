"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

// One violet point per person, spread evenly over a slowly turning sphere. The caller sets how
// many people there are through `people` (a ref, so it can change every frame without a
// re-render), and the points spread out or gather in to make room: the sphere grows with the team.
//
// Every point knows its number (i). With `uCount` people, point i sits at its place on an even
// spiral over the sphere (a Fibonacci sphere). uCount changes smoothly, so the points slide
// to their new places, and any point numbered past uCount fades out.

const MOST = 1600;

const vertexShader = `
    uniform float uCount;
    uniform float uTime;
    uniform float uDpr;
    attribute float aIndex;
    attribute vec3 aJitter;
    varying float vAlpha;

    void main() {
        float y = clamp(1.0 - 2.0 * (aIndex + 0.5) / uCount, -1.0, 1.0);
        float across = sqrt(1.0 - y * y);
        float turn = aIndex * 2.39996323; // the golden angle, so no two points line up
        vec3 place = vec3(cos(turn) * across, y, sin(turn) * across);

        // a few people make a small group, a big team a big sphere
        float radius = 0.35 + 2.0 * sqrt(uCount / ${MOST}.0);
        // each point drifts a little on its own, so it looks alive rather than printed
        vec3 drift = aJitter * 0.05 * sin(uTime * (0.6 + aJitter.x) + aIndex);
        vec4 view = modelViewMatrix * vec4(place * radius + drift, 1.0);
        gl_Position = projectionMatrix * view;

        // points are big when there are only a few of them, and smaller further back
        float size = mix(18.0, 4.5, smoothstep(3.0, 400.0, uCount));
        gl_PointSize = size * uDpr * (10.0 / -view.z);

        float depth = smoothstep(-radius, radius, (view.z + 10.0)); // 0 at the back, 1 at the front
        vAlpha = mix(0.22, 0.95, depth) * clamp(uCount - aIndex, 0.0, 1.0);
    }
`;

// a soft round dot, deep violet in the middle
const fragmentShader = `
    uniform vec3 uColor;
    uniform vec3 uGlow;
    varying float vAlpha;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 color = mix(uColor, uGlow, smoothstep(0.1, 0.5, d));
        gl_FragColor = vec4(color, vAlpha * smoothstep(0.5, 0.3, d));
    }
`;

export function TeamSwarm({ people, className = "" }: { people: RefObject<number>; className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dpr = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setPixelRatio(dpr);
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        box.append(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
        camera.position.z = 10;

        const index = new Float32Array(MOST);
        const jitter = new Float32Array(MOST * 3);
        for (let i = 0; i < MOST; i++) {
            index[i] = i;
            jitter.set([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], i * 3);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("aIndex", new THREE.BufferAttribute(index, 1));
        geometry.setAttribute("aJitter", new THREE.BufferAttribute(jitter, 3));
        // three.js wants a position for each point; the shader works out the real one
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MOST * 3), 3));

        const uniforms = {
            uCount: { value: people.current },
            uTime: { value: 0 },
            uDpr: { value: dpr },
            uColor: { value: new THREE.Color("#4a38f5") },
            uGlow: { value: new THREE.Color("#b3abff") },
        };
        const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false });
        const points = new THREE.Points(geometry, material);
        // the real places are only known in the shader, so don't let three.js hide them as "off screen"
        points.frustumCulled = false;
        const scene = new THREE.Scene().add(points);

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            renderer.render(scene, camera);
        });
        resizer.observe(box);

        // the pointer tilts the sphere a little, -0.5 to 0.5 each way from its middle
        let pointerX = 0;
        let pointerY = 0;
        function onMove(event: PointerEvent) {
            const rect = box.getBoundingClientRect();
            pointerX = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width - 0.5, -0.8, 0.8);
            pointerY = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height - 0.5, -0.8, 0.8);
        }
        window.addEventListener("pointermove", onMove, { passive: true });

        let frame = 0;
        function tick() {
            frame = requestAnimationFrame(tick);
            // eased in proportion (log), so going from 3 to 1600 feels as even as 1600 to 3
            const goal = THREE.MathUtils.clamp(people.current, 1, MOST);
            const count = uniforms.uCount.value;
            uniforms.uCount.value = still ? goal : Math.exp(Math.log(count) + (Math.log(goal) - Math.log(count)) * 0.05);
            if (!still) {
                uniforms.uTime.value += 0.016;
                points.rotation.y += 0.0025;
            }
            points.rotation.x += (0.35 + pointerY * 0.4 - points.rotation.x) * 0.05;
            points.rotation.z += (pointerX * -0.3 - points.rotation.z) * 0.05;
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
            geometry.dispose();
            material.dispose();
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [people]);

    return <div ref={boxRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
