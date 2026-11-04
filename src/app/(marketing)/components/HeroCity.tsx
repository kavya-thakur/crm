"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// A repeatable random sequence, so the city is the same on every visit
function seeded(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// The city is drawn first in plain greys: walls shaded by a low sun, a grid of pale
// windows on every side, and fog washing out whatever is far away.
const buildingVertex = `
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vDepth;
    void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 view = viewMatrix * world;
        vDepth = -view.z;
        gl_Position = projectionMatrix * view;
    }
`;

const buildingFragment = `
    varying vec3 vWorld;
    varying vec3 vNormal;
    varying float vDepth;
    void main() {
        vec3 normal = normalize(vNormal);
        float shade = 0.3 + 0.5 * max(dot(normal, normalize(vec3(-0.6, 0.5, 0.4))), 0.0);
        if (normal.y > 0.5) {
            shade = 0.8;
        } else {
            float along = abs(normal.x) > 0.5 ? vWorld.z : vWorld.x;
            vec2 grid = fract(vec2(along / 1.4, vWorld.y / 1.6));
            float window = step(0.25, grid.x) * step(grid.x, 0.7) * step(0.3, grid.y) * step(grid.y, 0.75);
            shade = mix(shade, 0.93, window);
        }
        shade = mix(shade, 1.0, smoothstep(30.0, 90.0, vDepth) * 0.85);
        gl_FragColor = vec4(vec3(shade), 1.0);
    }
`;

const screenVertex = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

// twenty.com's halftone pass: the picture is cut into square cells, and each cell
// gets one rounded dash whose length follows how dark the picture is there. Near
// the pointer the dashes grow, as if a light were shining on that part of the city.
const halftoneFragment = `
    uniform sampler2D tScene;
    uniform vec2 resolution;
    uniform float tile;
    uniform vec3 dashColor;
    uniform vec2 pointer;
    uniform float lightStrength;
    uniform float lightRadius;

    float dashDistance(vec2 cell, float halfLength, float widthRatio) {
        vec2 offset = cell - 0.5;
        offset.x -= clamp(offset.x, -halfLength, halfLength);
        return length(offset) - widthRatio * halfLength;
    }

    void main() {
        vec2 cellIndex = floor(gl_FragCoord.xy / tile);
        vec2 cellUv = fract(gl_FragCoord.xy / tile);
        vec4 scene = texture2D(tScene, (cellIndex + 0.5) * tile / resolution);

        float mask = smoothstep(0.02, 0.08, scene.a);
        float tone = 1.0 - (scene.r + scene.g + scene.b) / 3.0;
        float light = smoothstep(lightRadius, 0.0, length(gl_FragCoord.xy - pointer)) * lightStrength * 0.35;
        float halfLength = clamp(tone - 0.016 + light, 0.0, 1.0) * 0.93;

        float alpha = 0.0;
        if (halfLength > 0.0001) {
            alpha = (1.0 - smoothstep(0.0, 0.02, dashDistance(cellUv, halfLength, 0.34))) * mask;
        }
        gl_FragColor = vec4(dashColor * alpha, alpha);
    }
`;

// Tall towers either side, lower blocks in the middle (behind the product window),
// thinning out into the fog toward the back
function buildCity(material: THREE.Material) {
    const random = seeded(20);
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const city = new THREE.Group();

    for (let z = 2; z > -70; z -= 5) {
        for (let x = -60; x <= 60; x += 5) {
            if (random() < 0.15) continue;
            const edge = Math.min(1, Math.abs(x) / 50);
            const height = 3 + random() * 5 + edge ** 1.6 * 26 * (0.5 + random());
            const building = new THREE.Mesh(box, material);
            building.position.set(x + (random() - 0.5) * 1.5, 0, z + (random() - 0.5) * 1.5);
            building.scale.set(2.6 + random() * 1.6, height, 2.6 + random() * 1.6);
            city.add(building);
        }
    }
    return city;
}

export function HeroCity({ className = "" }: { className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const box = boxRef.current!;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dpr = Math.min(window.devicePixelRatio, 2);

        const renderer = new THREE.WebGLRenderer({ alpha: true });
        renderer.setPixelRatio(dpr);
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.cssText = "display:block;width:100%;height:100%";
        box.appendChild(renderer.domElement);

        const buildingMaterial = new THREE.ShaderMaterial({ vertexShader: buildingVertex, fragmentShader: buildingFragment });
        const scene = new THREE.Scene().add(buildCity(buildingMaterial));
        const camera = new THREE.PerspectiveCamera(35, 1, 1, 200);
        const target = new THREE.WebGLRenderTarget(1, 1);

        const halftone = new THREE.ShaderMaterial({
            vertexShader: screenVertex,
            fragmentShader: halftoneFragment,
            depthTest: false,
            uniforms: {
                tScene: { value: target.texture },
                resolution: { value: new THREE.Vector2() },
                tile: { value: 12 * dpr },
                dashColor: { value: new THREE.Color("#4a38f5") },
                pointer: { value: new THREE.Vector2(-9999, -9999) },
                lightStrength: { value: 0 },
                lightRadius: { value: 0 },
            },
        });
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), halftone);
        const screenScene = new THREE.Scene().add(screen);
        const screenCamera = new THREE.OrthographicCamera();

        function draw(time: number) {
            // a slow sideways drift, so the city reads as 3D rather than a flat picture
            const drift = still ? 0 : Math.sin(time * 0.00012) * 4;
            camera.position.set(drift, 10, 34);
            camera.lookAt(drift * 0.4, 9, 0);

            renderer.setRenderTarget(target);
            renderer.clear();
            renderer.render(scene, camera);
            renderer.setRenderTarget(null);
            renderer.render(screenScene, screenCamera);
        }

        const resizer = new ResizeObserver(() => {
            const { width, height } = box.getBoundingClientRect();
            renderer.setSize(width, height, false);
            target.setSize(width * dpr, height * dpr);
            halftone.uniforms.resolution.value.set(width * dpr, height * dpr);
            halftone.uniforms.lightRadius.value = 0.22 * height * dpr;
            camera.aspect = width / height || 1;
            camera.updateProjectionMatrix();
            draw(performance.now());
        });
        resizer.observe(box);

        // The light follows the pointer with a little lag, fading in when the pointer
        // is over the city and out when it leaves. The canvas itself never takes clicks.
        const goal = new THREE.Vector2(-9999, -9999);
        let lightGoal = 0;

        function onMove(event: PointerEvent) {
            const rect = box.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
            lightGoal = inside ? 1 : 0;
            goal.set((event.clientX - rect.left) * dpr, (rect.bottom - event.clientY) * dpr);
            if (halftone.uniforms.pointer.value.x < -9000) halftone.uniforms.pointer.value.copy(goal);
        }
        window.addEventListener("pointermove", onMove, { passive: true });

        let frame = 0;
        function tick(time: number) {
            frame = requestAnimationFrame(tick);
            halftone.uniforms.pointer.value.lerp(goal, 0.38);
            halftone.uniforms.lightStrength.value += (lightGoal - halftone.uniforms.lightStrength.value) * 0.08;
            draw(time);
        }

        const watcher = new IntersectionObserver(([entry]) => {
            cancelAnimationFrame(frame);
            if (entry.isIntersecting) frame = requestAnimationFrame(tick);
        });
        watcher.observe(box);

        return () => {
            cancelAnimationFrame(frame);
            watcher.disconnect();
            resizer.disconnect();
            window.removeEventListener("pointermove", onMove);
            scene.traverse((child) => (child as THREE.Mesh).geometry?.dispose());
            screen.geometry.dispose();
            buildingMaterial.dispose();
            halftone.dispose();
            target.dispose();
            // hand the WebGL context back now; browsers only allow about 16 at once
            renderer.forceContextLoss();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, []);

    return <div ref={boxRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
