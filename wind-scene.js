// Escena 3D del spot La Bajada (Claromecó): costa low-poly con partículas de viento,
// manga de viento, mar que reacciona al viento, kites según las condiciones y luz según la hora.
// Se carga de forma diferida desde app.js cuando se elige "Vista 3D".
//
// Orientación real del spot: tierra al norte, mar al sur (offshore = viento del sector N).
// Mundo: +x = Este, -z = Norte, +z = Sur. La cámara está en la playa mirando al mar (como la cámara de la radio, ~160°).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
import { buildKite } from './vip-kite.js';

const BOX = { x: 12, zMin: -9, zMax: 9, yMin: 0.25, yMax: 2.2 };
const STREAK_SECONDS = 0.6;  // largo de cada estela = distancia recorrida en este tiempo
const KTS_TO_UNITS = 0.09;     // velocidad visual por nudo
const SEA_Z = 20.5;            // centro del plano del mar
const WATER = { xMax: 8, zMin: 1.8, zMax: 7.5 }; // zona donde navegan los kites

// Misma escala que windColor() de app.js
function windColor(kts) {
    if (kts <= 14) return 0x93c5fd;
    if (kts <= 16) return 0x67e8f9;
    if (kts <= 19) return 0x86efac;
    if (kts <= 22) return 0xfde047;
    if (kts <= 27) return 0xfb923c;
    return 0xf87171;
}

const isOffshore = (deg) => deg !== null && deg !== undefined && (deg > 292.5 || deg <= 67.5);

// Cantidad de kites en el agua: traduce el "Estado del Spot" de app.js a una imagen
export function kitesForConditions(kts, deg) {
    if (isOffshore(deg) || kts <= 14 || kts > 33) return 0;
    const epic = kts >= 17 && kts < 25 && deg >= 68 && deg <= 146;
    if (epic) return 6;
    if (kts <= 16) return 1;
    if (kts <= 19) return 3;
    if (kts <= 22) return 4;
    if (kts <= 27) return 3;
    return 2;
}

// Colores del cielo según la hora local de Claromecó (interpolados entre estos puntos)
const SKY_KEYS = [
    [0, 0x0b1a33], [5.5, 0x0b1a33], [6.8, 0xf6b38a], [9, 0xbfe3f5],
    [17.5, 0xbfe3f5], [19.3, 0xf59e63], [20.5, 0x0b1a33], [24, 0x0b1a33],
];
function skyColorAt(hour) {
    for (let i = 1; i < SKY_KEYS.length; i++) {
        const [h1, c1] = SKY_KEYS[i];
        const [h0, c0] = SKY_KEYS[i - 1];
        if (hour <= h1) return new THREE.Color(c0).lerp(new THREE.Color(c1), (hour - h0) / (h1 - h0));
    }
    return new THREE.Color(SKY_KEYS[0][1]);
}
function argentinaHour() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find(p => p.type === type)?.value || 0);
    return get('hour') + get('minute') / 60;
}

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

// Manga de viento: mástil + manga a franjas rojas/blancas. La manga apunta hacia donde va el viento.
function buildWindsock() {
    const root = new THREE.Group();
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.05, 2, 8),
        new THREE.MeshLambertMaterial({ color: 0x9ca3af })
    );
    pole.position.y = 1;
    root.add(pole);

    const yaw = new THREE.Group();     // gira hacia donde va el viento
    yaw.position.y = 1.95;
    const pitch = new THREE.Group();   // cae cuando hay poco viento
    yaw.add(pitch);
    root.add(yaw);

    const segments = 4;
    for (let i = 0; i < segments; i++) {
        const rStart = 0.2 - i * 0.03;
        const seg = new THREE.Mesh(
            new THREE.CylinderGeometry(rStart - 0.03, rStart, 0.32, 12, 1, true),
            new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xef4444, side: THREE.DoubleSide })
        );
        seg.rotation.z = -Math.PI / 2;  // eje de la manga sobre +X local
        seg.position.x = 0.16 + i * 0.32;
        pitch.add(seg);
    }
    return { root, yaw, pitch };
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
    // Tamaño CSS fijo al contenedor: setSize(..., false) no lo toca y con DPR > 1 el canvas se agrandaría
    Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%' });

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe3f5);
    scene.fog = new THREE.Fog(0xbfe3f5, 10, 30);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    // Desde la playa (norte) mirando al mar (sur): el Este queda a la izquierda, como en la realidad
    camera.position.set(0, 5.5, -9);
    camera.lookAt(0, 0, 2.5);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a5c, 1.6);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-4, 8, 6);
    scene.add(hemi, sun);

    // Tierra (dunas), playa y mar
    const land = lowPolyPlane(30, 10, 24, 8, 0xc9b27c, 0.6, 7);
    land.position.set(0, 0.15, -6.5);
    const beach = lowPolyPlane(30, 3, 24, 3, 0xe8d6a8, 0.12, 11);
    beach.position.set(0, 0.05, -0.5);
    // Mar largo para que el horizonte se pierda en la niebla
    const sea = lowPolyPlane(60, 40, 40, 24, 0x2b8fc9, 0.18, 23);
    sea.position.set(0, -0.05, SEA_Z);
    sea.material.transparent = true;
    sea.material.opacity = 0.95;
    scene.add(land, beach, sea);
    const seaBaseY = Float32Array.from(sea.geometry.attributes.position.array.filter((_, i) => i % 3 === 1));

    // Manga de viento en la playa, a la derecha de la vista
    const windsock = buildWindsock();
    windsock.root.position.set(-2.6, 0.05, -2.4);
    scene.add(windsock.root);

    // Espuma (borreguitos): aparece a partir de ~15 kts, más cantidad cuanto más viento
    const foamMax = isMobile ? 40 : 70;
    const foam = Array.from({ length: foamMax }, () => ({
        x: (Math.random() * 2 - 1) * 11, z: 1.5 + Math.random() * 13, phase: Math.random() * Math.PI * 2,
    }));
    const foamPositions = new Float32Array(foamMax * 3);
    const foamGeo = new THREE.BufferGeometry();
    foamGeo.setAttribute('position', new THREE.BufferAttribute(foamPositions, 3));
    const foamMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, transparent: true, opacity: 0.9 });
    const foamPoints = new THREE.Points(foamGeo, foamMat);
    scene.add(foamPoints);

    // Kites en el agua (reutiliza el kite del modal VIP, en escala chica) con su rider
    const kiteMax = isMobile ? 4 : 6;
    const riderMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    const kites = Array.from({ length: kiteMax }, (_, i) => {
        const group = new THREE.Group();
        const kite = buildKite();
        kite.scale.setScalar(0.32);
        kite.position.y = 1.2;
        const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 4, 8), riderMat);
        rider.position.y = 0.2;
        group.add(kite, rider);
        group.visible = false;
        scene.add(group);
        return {
            group, kite,
            x: -WATER.xMax + (i + 0.5) * (2 * WATER.xMax / kiteMax),
            z: WATER.zMin + Math.random() * (WATER.zMax - WATER.zMin),
            heading: i % 2 ? 1 : -1,   // sentido de navegación (cruzado al viento)
            phase: Math.random() * Math.PI * 2,
        };
    });

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
    let offshore = false;
    let live = true;             // false = dato con demora: la escena queda congelada
    let activeKites = 0;
    let activeFoam = 0;
    let t = 0;                   // tiempo de animación (s)

    // Oleaje: más alto y rápido con más viento; con offshore el mar se ve más planchado
    const waveAmp = () => Math.min(0.04 + speed * 0.007, 0.26) * (offshore ? 0.45 : 1);
    const waveSpeed = () => 1 + speed * 0.04;
    const waveY = (x, zLocal) => Math.sin(t * waveSpeed() + x * 0.6 + zLocal * 0.9) * waveAmp();

    function writeStreaks() {
        const len = speed * KTS_TO_UNITS * STREAK_SECONDS;
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            const l = len * p.factor;
            positions.set([p.x, p.y, p.z, p.x - dir.x * l, p.y, p.z - dir.z * l], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
    }

    function writeSea() {
        const seaPos = sea.geometry.attributes.position;
        for (let i = 0; i < seaPos.count; i++) seaPos.setY(i, seaBaseY[i] + waveY(seaPos.getX(i), seaPos.getZ(i)));
        seaPos.needsUpdate = true;
    }

    function writeFoam() {
        for (let i = 0; i < activeFoam; i++) {
            const f = foam[i];
            // Cada borreguito "rompe" y desaparece: se baja bajo el agua en la fase apagada
            const on = Math.sin(t * 2.2 + f.phase) > 0.2;
            foamPositions.set([f.x, on ? 0.05 + waveY(f.x, f.z - SEA_Z) : -5, f.z], i * 3);
        }
        foamGeo.setDrawRange(0, activeFoam);
        foamGeo.attributes.position.needsUpdate = true;
    }

    function writeWindsock() {
        windsock.yaw.rotation.y = Math.atan2(-dir.z, dir.x);
        // 0 kts: colgando; 15+ kts: horizontal, temblando más con ráfagas
        const droop = (1 - Math.min(speed / 15, 1)) * 1.35;
        const flutter = speed > 3 ? Math.sin(t * (6 + speed * 0.3)) * 0.05 * gustRatio : 0;
        windsock.pitch.rotation.z = -droop + flutter;
    }

    function writeKites(dt) {
        const upwind = Math.atan2(-dir.x, -dir.z);   // el kite mira hacia el viento
        const cross = { x: dir.z, z: -dir.x };        // se navega cruzado al viento
        const boardSpeed = 0.6 + speed * 0.03;
        kites.forEach((k, i) => {
            k.group.visible = i < activeKites;
            if (!k.group.visible) return;
            k.x += cross.x * k.heading * boardSpeed * dt;
            k.z += cross.z * k.heading * boardSpeed * dt;
            // Al llegar al borde de la zona de navegación, trasluchada
            if (Math.abs(k.x) > WATER.xMax || k.z < WATER.zMin || k.z > WATER.zMax) {
                k.heading *= -1;
                k.x = THREE.MathUtils.clamp(k.x, -WATER.xMax, WATER.xMax);
                k.z = THREE.MathUtils.clamp(k.z, WATER.zMin, WATER.zMax);
            }
            k.group.position.set(k.x, waveY(k.x, k.z - SEA_Z), k.z);
            k.group.rotation.y = upwind;
            // Kite a sotavento del rider, haciendo ochos suaves
            k.kite.position.set(Math.sin(t * 0.9 + k.phase) * 0.35, 1.2 + Math.sin(t * 1.3 + k.phase) * 0.1, -0.7);
            k.kite.rotation.z = Math.sin(t * 0.9 + k.phase) * 0.35;
        });
    }

    function applyTimeOfDay(hour) {
        const sky = skyColorAt(hour);
        scene.background.copy(sky);
        scene.fog.color.copy(sky);
        const daylight = THREE.MathUtils.clamp(Math.sin(((hour - 6) / 14) * Math.PI), 0, 1); // ~6 a 20 h
        hemi.intensity = 0.35 + daylight * 1.25;
        sun.intensity = 0.2 + daylight * 1.2;
        // El sol sale por el Este (+x, izquierda de la vista) y se pone por el Oeste
        const arc = ((hour - 6) / 14) * Math.PI;
        sun.position.set(Math.cos(arc) * 8, 2 + Math.sin(Math.max(arc, 0)) * 7, 6);
        sun.color.set(daylight < 0.35 ? 0xffb37a : 0xffffff);
    }

    function step(dt) {
        t += dt;
        const base = speed * KTS_TO_UNITS;
        for (const p of particles) {
            const v = base * p.factor * (1 + (gustRatio - 1) * Math.max(0, Math.sin(t * 0.7 + p.factor * 9)));
            p.x += dir.x * v * dt;
            p.z += dir.z * v * dt;
            // Reaparece del lado contrario al salir de la caja
            if (p.x > BOX.x) p.x -= 2 * BOX.x; else if (p.x < -BOX.x) p.x += 2 * BOX.x;
            if (p.z > BOX.zMax) p.z -= BOX.zMax - BOX.zMin; else if (p.z < BOX.zMin) p.z += BOX.zMax - BOX.zMin;
        }
        writeSea();
        writeFoam();
        writeWindsock();
        writeKites(dt);
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
        step(dt);
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
    applyTimeOfDay(argentinaHour());
    resize();

    return {
        // { speed, gust, direction (grados, de dónde viene), live (false = congelada), hour (opcional, para pruebas) }
        update({ speed: kts, gust, direction, live: isLive = true, hour }) {
            live = isLive;
            speed = Math.max(0, kts || 0);
            gustRatio = gust && kts ? Math.min(Math.max(gust / kts, 1), 2) : 1;
            offshore = isOffshore(direction);
            if (direction !== null && direction !== undefined) {
                const toward = (direction + 180) * Math.PI / 180;
                dir = { x: Math.sin(toward), z: -Math.cos(toward) };
            }
            activeKites = Math.min(kitesForConditions(speed, direction), kiteMax);
            activeFoam = speed < 15 ? 0 : Math.min(Math.round((speed - 14) * 6), foamMax);
            applyTimeOfDay(hour ?? argentinaHour());
            paintStreaks(offshore ? 0xef4444 : windColor(speed));
            // Un paso de 0 s acomoda manga, mar, espuma y kites aunque la escena esté congelada
            step(0);
            renderer.render(scene, camera);
            syncLoop();
        },
    };
}
