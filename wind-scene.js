// Escena 3D del spot La Bajada (Claromecó): costa low-poly con partículas de viento.
// Se carga de forma diferida desde app.js después del primer dato de viento.
//
// Orientación real del spot: tierra al norte, mar al sur (offshore = viento del sector N).
// Mundo: +x = Este, -z = Norte, +z = Sur. La cámara está en la playa mirando al mar (como la cámara de la radio, ~160°).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const BOX = { x: 12, zMin: -9, zMax: 9, yMin: 0.25, yMax: 2.2 };
const STREAK_SECONDS = 0.6;  // largo de cada estela = distancia recorrida en este tiempo
const KTS_TO_UNITS = 0.09;     // velocidad visual por nudo

// Misma escala que windColor() de app.js
function windColor(kts) {
    if (kts <= 14) return 0x93c5fd;
    if (kts <= 16) return 0x67e8f9;
    if (kts <= 19) return 0x86efac;
    if (kts <= 22) return 0xfde047;
    if (kts <= 27) return 0xfb923c;
    return 0xf87171;
}

const isOffshore = (deg) => deg !== null && (deg > 292.5 || deg <= 67.5);

// Plano low-poly con alturas aleatorias (estático) para tierra y mar
function lowPolyPlane(width, depth, segX, segZ, color, roughness, seed) {
    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    let s = seed;
    const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < pos.count; i++) pos.setY(i, (rand() - 0.5) * roughness);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }));
}

export function createWindScene(container) {
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch (e) {
        return null; // sin WebGL: la app sigue con la tarjeta de siempre
    }

    const isMobile = matchMedia('(pointer: coarse)').matches;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe3f5);
    scene.fog = new THREE.Fog(0xbfe3f5, 10, 30);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    // Desde la playa (norte) mirando al mar (sur): el Este queda a la izquierda, como en la realidad
    camera.position.set(0, 5.5, -9);
    camera.lookAt(0, 0, 2.5);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 8, 6);
    scene.add(sun);

    // Tierra (dunas), playa y mar
    const land = lowPolyPlane(30, 10, 24, 8, 0xc9b27c, 0.6, 7);
    land.position.set(0, 0.15, -6.5);
    const beach = lowPolyPlane(30, 3, 24, 3, 0xe8d6a8, 0.12, 11);
    beach.position.set(0, 0.05, -0.5);
    // Mar largo para que el horizonte se pierda en la niebla
    const sea = lowPolyPlane(60, 40, 40, 24, 0x2b8fc9, 0.18, 23);
    sea.position.set(0, -0.05, 20.5);
    sea.material.transparent = true;
    sea.material.opacity = 0.95;
    scene.add(land, beach, sea);
    const seaBaseY = Float32Array.from(sea.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));

    // Estelas de viento: un segmento por partícula
    const count = isMobile ? 160 : 320;
    const positions = new Float32Array(count * 6);
    const particles = Array.from({ length: count }, () => ({
        x: (Math.random() * 2 - 1) * BOX.x,
        y: BOX.yMin + Math.random() * (BOX.yMax - BOX.yMin),
        z: BOX.zMin + Math.random() * (BOX.zMax - BOX.zMin),
        factor: 0.75 + Math.random() * 0.5, // variación individual (ráfagas)
    }));
    // Color por vértice: punta con el color del viento, cola desvanecida → la dirección se lee aunque esté quieta
    const colors = new Float32Array(count * 6);
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    streakGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const streakMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
    scene.add(new THREE.LineSegments(streakGeo, streakMat));

    const tailMix = new THREE.Color(0xffffff);
    function paintStreaks(hex) {
        const head = new THREE.Color(hex);
        const tail = head.clone().lerp(tailMix, 0.75);
        for (let i = 0; i < count; i++) colors.set([head.r, head.g, head.b, tail.r, tail.g, tail.b], i * 6);
        streakGeo.attributes.color.needsUpdate = true;
    }

    // Estado del viento
    let dir = { x: 0, z: -1 };   // hacia dónde va el viento (unitario)
    let speed = 0;               // kts
    let gustRatio = 1;
    let live = true;             // false = dato con demora: la escena queda congelada

    function writeStreaks() {
        const len = speed * KTS_TO_UNITS * STREAK_SECONDS;
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            const l = len * p.factor;
            positions.set([p.x, p.y, p.z, p.x - dir.x * l, p.y, p.z - dir.z * l], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
    }

    function step(dt, t) {
        const base = speed * KTS_TO_UNITS;
        for (const p of particles) {
            const v = base * p.factor * (1 + (gustRatio - 1) * Math.max(0, Math.sin(t * 0.7 + p.factor * 9)));
            p.x += dir.x * v * dt;
            p.z += dir.z * v * dt;
            // Reaparece del lado contrario al salir de la caja
            if (p.x > BOX.x) p.x -= 2 * BOX.x; else if (p.x < -BOX.x) p.x += 2 * BOX.x;
            if (p.z > BOX.zMax) p.z -= BOX.zMax - BOX.zMin; else if (p.z < BOX.zMin) p.z += BOX.zMax - BOX.zMin;
        }
        // Oleaje suave
        const seaPos = sea.geometry.attributes.position;
        for (let i = 0; i < seaPos.count; i++) {
            seaPos.setY(i, seaBaseY[i] + Math.sin(t * 1.2 + seaPos.getX(i) * 0.6 + seaPos.getZ(i) * 0.9) * 0.06);
        }
        seaPos.needsUpdate = true;
        writeStreaks();
    }

    function resize() {
        const { clientWidth: w, clientHeight: h } = container;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
    }

    // Loop solo mientras la escena está visible en pantalla y la pestaña activa (ahorro de batería)
    let onScreen = false;
    let rafId = null;
    let last = performance.now();
    function frame(now) {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        step(dt, now / 1000);
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(frame);
    }
    function syncLoop() {
        const shouldRun = live && onScreen && document.visibilityState === 'visible' && !reducedMotion && speed > 0;
        if (shouldRun && rafId === null) { last = performance.now(); rafId = requestAnimationFrame(frame); }
        if (!shouldRun && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; syncLoop(); }).observe(container);
    document.addEventListener('visibilitychange', syncLoop);
    new ResizeObserver(resize).observe(container);
    resize();

    return {
        // { speed, gust, direction (grados, de dónde viene), live (false = congelada) }
        update({ speed: kts, gust, direction, live: isLive = true }) {
            live = isLive;
            speed = Math.max(0, kts || 0);
            gustRatio = gust && kts ? Math.min(Math.max(gust / kts, 1), 2) : 1;
            if (direction !== null && direction !== undefined) {
                const toward = (direction + 180) * Math.PI / 180;
                dir = { x: Math.sin(toward), z: -Math.cos(toward) };
            }
            paintStreaks(isOffshore(direction) ? 0xef4444 : windColor(speed));
            writeStreaks();
            renderer.render(scene, camera);
            syncLoop();
        },
    };
}
