"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

// The page animates these with GSAP; the render loop reads them every frame
export interface SceneControls {
    light: number; // 0 → 1: studio lights come up (a bit past 1 on the welcome screen)
    turn: number; // extra bolt rotation, radians
    drift: number; // 0 → 1: everything rushes: the dash streams and the dust
    center: number; // 0 → 1: bolt glides to the top middle and gets smaller
}

const BOLT_SIZE = 0.17;
const DUST = 400;

// The landing hero's halftone style (see HeroCity): the screen is cut into square cells and each
// cell gets one rounded dash. Here the dash length follows a flowing noise field, so the dashes
// draw long streams of light moving left to right. Near the pointer the dashes grow.
const streamsFragment = `
    uniform vec2 resolution;
    uniform float tile;
    uniform float offset;
    uniform float stretch;
    uniform float reveal;
    uniform vec2 pointer;
    uniform float lightRadius;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
        }
        return v;
    }
    float dashDistance(vec2 cell, float halfLength, float widthRatio) {
        vec2 d = cell - 0.5;
        d.x -= clamp(d.x, -halfLength, halfLength);
        return length(d) - widthRatio * halfLength;
    }

    void main() {
        vec2 cell = floor(gl_FragCoord.xy / tile);
        vec2 cellUv = fract(gl_FragCoord.xy / tile);
        vec2 uv = (cell + 0.5) * tile / resolution;

        // long horizontal streams that bend gently, flowing right; stretched further at speed
        float bend = sin(cell.x * 0.045 + offset * 0.6) * 1.6;
        float n = fbm(vec2(cell.x * 0.03 / stretch - offset, (cell.y + bend) * 0.2));
        float tone = smoothstep(0.48, 0.8, n);

        // strongest around the bolt (right of centre), quiet at the edges and behind the form
        tone *= smoothstep(1.0, 0.2, length((uv - vec2(0.64, 0.5)) * vec2(1.0, 1.4)));
        // sweeps in from the left as the lights come up, and out to the right as they go down
        tone *= clamp((reveal * 1.3 - uv.x) / 0.3, 0.0, 1.0);

        float light = smoothstep(lightRadius, 0.0, length(gl_FragCoord.xy - pointer)) * 0.3;
        float halfLength = clamp(tone + light * step(0.001, reveal), 0.0, 1.0) * 0.93;

        float alpha = 0.0;
        if (halfLength > 0.0001) {
            alpha = 1.0 - smoothstep(0.0, 0.02, dashDistance(cellUv, halfLength, 0.34));
        }
        // Flash violet, turning lavender where the stream is brightest
        vec3 color = mix(vec3(0.29, 0.22, 0.96), vec3(0.75, 0.72, 1.0), tone * tone);
        gl_FragColor = vec4(color, alpha * (0.35 + 0.5 * halfLength));
    }
`;

// Same outline as the Tabler bolt icon (24px grid), y flipped for 3D
function boltShape() {
    const s = new THREE.Shape();
    s.moveTo(13, -3);
    s.lineTo(13, -10);
    s.lineTo(19, -10);
    s.lineTo(11, -21);
    s.lineTo(11, -14);
    s.lineTo(5, -14);
    s.closePath();
    return s;
}

// A dark room with a few soft light panels. The black bolt only shows where it reflects them,
// which is how product shots get those long clean highlights.
function studio() {
    const room = new THREE.Scene();
    const panel = (w: number, h: number, color: THREE.Color, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
        mesh.position.set(x, y, z);
        mesh.lookAt(0, 0, 0);
        room.add(mesh);
    };
    panel(7, 1.4, new THREE.Color(0xffffff).multiplyScalar(2.2), 0, 5, 2); // top strip
    panel(1.2, 7, new THREE.Color(0xffffff).multiplyScalar(1.4), -5, 0.5, 1.5); // left rim
    panel(1.4, 6, new THREE.Color(0x4a38f5).multiplyScalar(3), 5, 0, -1); // violet rim on the right
    panel(5, 4, new THREE.Color(0x15151a), 0, -1, 6); // dim front fill
    return room;
}

// Soft round dot, used for the dust and the halo behind the bolt
function glowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

export default function Scene({ ctl }: { ctl: RefObject<SceneControls> }) {
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(innerWidth, innerHeight);
        renderer.setClearColor(0x000000, 0); // page background shows through
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.autoClear = false; // two passes per frame: the dash streams, then the bolt on top
        host.current!.appendChild(renderer.domElement);
        const dpr = renderer.getPixelRatio();

        const streams = new THREE.ShaderMaterial({
            vertexShader: "void main() { gl_Position = vec4(position, 1.0); }",
            fragmentShader: streamsFragment,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            uniforms: {
                resolution: { value: new THREE.Vector2(innerWidth * dpr, innerHeight * dpr) },
                tile: { value: 11 * dpr },
                offset: { value: 0 },
                stretch: { value: 1 },
                reveal: { value: 0 },
                pointer: { value: new THREE.Vector2(-9999, -9999) },
                lightRadius: { value: 0.2 * innerHeight * dpr },
            },
        });
        const backdrop = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), streams));
        const flat = new THREE.OrthographicCamera();

        const scene = new THREE.Scene();
        const pmrem = new THREE.PMREMGenerator(renderer);
        const room = studio();
        const envMap = pmrem.fromScene(room, 0.03).texture;
        room.traverse((o) => {
            if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                o.material.dispose();
            }
        });
        scene.environment = envMap;

        const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
        camera.position.z = 9;

        // Black lacquer: almost no colour of its own, a glossy clear coat that mirrors the light panels
        const boltGeo = new THREE.ExtrudeGeometry(boltShape(), {
            depth: 3,
            bevelEnabled: true,
            bevelThickness: 0.7,
            bevelSize: 0.5,
            bevelSegments: 16,
        });
        boltGeo.center();
        const bolt = new THREE.Mesh(
            boltGeo,
            new THREE.MeshPhysicalMaterial({ color: 0x060608, metalness: 0.2, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 }),
        );
        scene.add(bolt);

        const glow = glowTexture();
        const halo = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            new THREE.MeshBasicMaterial({ map: glow, color: 0x4a38f5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        halo.position.z = -3;
        scene.add(halo);

        // Faint dust slowly rising, like particles caught in a spotlight
        const dust = new Float32Array(DUST * 3);
        for (let i = 0; i < DUST; i++) {
            dust[i * 3] = (Math.random() - 0.5) * 24;
            dust[i * 3 + 1] = (Math.random() - 0.5) * 14;
            dust[i * 3 + 2] = -14 + Math.random() * 20;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
        const dustMat = new THREE.PointsMaterial({ map: glow, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        scene.add(new THREE.Points(dustGeo, dustMat));

        const mouse = { x: 0, y: 0 };
        const smooth = { x: 0, y: 0 };
        const pointer = new THREE.Vector2(-9999, -9999);
        const onMove = (e: MouseEvent) => {
            mouse.x = (e.clientX / innerWidth) * 2 - 1;
            mouse.y = (e.clientY / innerHeight) * 2 - 1;
            pointer.set(e.clientX * dpr, (innerHeight - e.clientY) * dpr);
        };
        const onResize = () => {
            camera.aspect = innerWidth / innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(innerWidth, innerHeight);
            streams.uniforms.resolution.value.set(innerWidth * dpr, innerHeight * dpr);
            streams.uniforms.lightRadius.value = 0.2 * innerHeight * dpr;
        };
        addEventListener("mousemove", onMove);
        addEventListener("resize", onResize);

        let last = performance.now();
        let t = 0;

        renderer.setAnimationLoop(() => {
            const now = performance.now();
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            t += dt;
            const c = ctl.current;
            const ease = 1 - Math.exp(-dt * 2); // same feel at 60Hz and 120Hz
            smooth.x += (mouse.x - smooth.x) * ease;
            smooth.y += (mouse.y - smooth.y) * ease;

            // Bolt sits on the right on wide screens (form on the left), centred otherwise
            const side = camera.aspect > 1 ? Math.min(camera.aspect * 1.4, 3) : 0;
            bolt.position.set(
                side * (1 - c.center),
                c.center * 1.3 + Math.sin(t * 0.5) * 0.06,
                0,
            );
            bolt.scale.setScalar(BOLT_SIZE * (1 - c.center * 0.35) * (0.94 + 0.06 * Math.min(c.light, 1)));
            bolt.rotation.set(smooth.y * 0.08, -0.5 + t * 0.12 + c.turn + smooth.x * 0.15, 0.08);

            halo.position.x = bolt.position.x;
            halo.position.y = bolt.position.y;
            halo.material.opacity = 0.32 * c.light;
            scene.environmentIntensity = c.light;
            dustMat.opacity = 0.5 * Math.min(c.light, 1);

            const rise = dt * (0.06 + c.drift * 0.5);
            const push = dt * c.drift * 2.5;
            for (let i = 0; i < DUST; i++) {
                dust[i * 3 + 1] += rise;
                dust[i * 3 + 2] += push;
                if (dust[i * 3 + 1] > 7) dust[i * 3 + 1] = -7;
                if (dust[i * 3 + 2] > 6) dust[i * 3 + 2] = -14;
            }
            dustGeo.attributes.position.needsUpdate = true;

            const u = streams.uniforms;
            u.offset.value += dt * (0.12 + c.drift * 2.2);
            u.stretch.value = 1 + c.drift * 3;
            u.reveal.value = Math.min(c.light, 1);
            if (u.pointer.value.x < -9000) u.pointer.value.copy(pointer);
            u.pointer.value.lerp(pointer, 1 - Math.exp(-dt * 10));

            camera.position.set(smooth.x * 0.3, -smooth.y * 0.2, 9);
            camera.lookAt(0, 0, 0);
            renderer.clear();
            renderer.render(backdrop, flat);
            renderer.render(scene, camera);
        });

        return () => {
            renderer.setAnimationLoop(null);
            removeEventListener("mousemove", onMove);
            removeEventListener("resize", onResize);
            backdrop.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
            streams.dispose();
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
                    o.geometry.dispose();
                    o.material.dispose();
                }
            });
            glow.dispose();
            envMap.dispose();
            pmrem.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [ctl]);

    return <div ref={host} aria-hidden className="fixed inset-0" />;
}
