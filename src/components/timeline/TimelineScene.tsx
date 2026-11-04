/**
 * 3D life timeline. Entries are "stations" along a glowing path above an endless
 * grid; scroll progress (0–1, written into `progress.current` by ScrollTrigger)
 * flies the camera from one station to the next.
 * Loaded on demand by Timeline.astro, never on touch / low-power / reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Grid, Sparkles, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  MathUtils,
  NormalBlending,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
  type Group,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type PerspectiveCamera,
  type PointLight,
  type Texture,
} from 'three';
import type { TimelineEntryView, TimelineType } from '../../lib/types';
import { monthYear, year } from '../../lib/types';

export interface SceneProps {
  entries: TimelineEntryView[];
  /** Mutable scroll progress, 0–1. Read every frame, never triggers a React render. */
  progress: { current: number };
  onSelect: (index: number) => void;
  onHover: (entry: TimelineEntryView | null) => void;
}

const INK = '#141311';
const PAPER = '#eeeae1';
const SPACING = 10;
const FLOOR = -2.2;
const BASE_FOV = 45;
/** Where the camera sits relative to the point it looks at. */
const CAMERA_OFFSET = new Vector3(0, 1.5, 7.5);

const TYPE_LABEL: Record<TimelineType, string> = {
  birth: 'Beginnings',
  education: 'Education',
  job: 'Career',
  move: 'New city',
  achievement: 'Milestone',
  personal: 'Life',
};

const cssVar = (name: string, fallback: string) =>
  (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) ||
  fallback;

/** Station positions: a gentle zig-zag receding into the distance. */
function layout(count: number) {
  return Array.from(
    { length: count },
    (_, i) => new Vector3(Math.sin(i * 1.15) * 3.6, 0.3 + Math.cos(i * 0.85) * 0.6, -i * SPACING)
  );
}

/** Sets an opacity that is recomputed every frame (so the leave-fade can scale it). */
function setDynamic(m: Material, opacity: number) {
  m.userData.dynamic = true;
  m.opacity = opacity;
}

/**
 * Compile every shader (and upload textures) ahead of time. Photos and year labels mount
 * late, after their textures load, so compile again a few times during the first seconds;
 * otherwise the first frame that shows them stalls while the GPU compiles.
 */
function Warmup() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const timers = [0, 600, 1800, 4000].map((ms) =>
      window.setTimeout(() => {
        scene.traverse((o) => {
          const map = ((o as Mesh).material as MeshBasicMaterial | undefined)?.map;
          if (map) gl.initTexture(map);
        });
        gl.compile(scene, camera);
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [gl, scene, camera]);
  return null;
}

/** Soft round sprite used by the particle systems. */
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export default function TimelineScene({ entries, progress, onSelect, onHover }: SceneProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  // Stop rendering while the section is off screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const entry = entries[active];
  const pad = (n: number) => String(n).padStart(2, '0');
  // Written straight to the DOM every frame (no React render) for the progress bar.
  const setProgressVar = (p: number) => wrap.current?.style.setProperty('--tl-p', p.toFixed(4));

  return (
    <div ref={wrap} className="tl-scene" style={{ ['--tl-color' as string]: entry?.color }}>
      <Canvas
        className="tl-scene__canvas"
        dpr={[1, 1.75]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ fov: BASE_FOV, near: 0.1, far: 140, position: [0, 1.5, 7.5] }}
        gl={{ powerPreference: 'high-performance', antialias: false }}
        aria-hidden="true"
      >
        <World
          entries={entries}
          progress={progress}
          onSelect={onSelect}
          onHover={onHover}
          onActive={setActive}
          onProgress={setProgressVar}
        />
      </Canvas>

      {/* Giant outlined index, bottom right. */}
      <p key={`ghost-${active}`} className="tl-ghost" aria-hidden="true">
        {pad(active + 1)}
      </p>

      {entry && (
        <article key={entry.id} className="tl-card" aria-hidden="true">
          <div className="tl-card__top">
            <span className="tl-card__index">
              {pad(active + 1)} / {pad(entries.length)}
            </span>
            <span className="tl-card__type">{TYPE_LABEL[entry.type] ?? entry.type}</span>
          </div>
          <p className="tl-card__year">
            {year(entry.start)
              .split('')
              .map((d, i) => (
                <span key={i} className="tl-card__digit" style={{ animationDelay: `${i * 60}ms` }}>
                  {d}
                </span>
              ))}
          </p>
          <h3 className="tl-card__title">
            <span className="tl-card__line">{entry.title}</span>
          </h3>
          <p className="tl-card__meta">
            {monthYear(entry.start)}
            {entry.end && ` – ${monthYear(entry.end)}`}
            {entry.location && ` · ${entry.location}`}
          </p>
          {entry.description && <p className="tl-card__desc">{entry.description}</p>}
        </article>
      )}

      {/* Real buttons, so the jump navigation also works from the keyboard. */}
      <nav className="tl-rail" aria-label="Jump to a moment in the timeline">
        {entries.map((e, i) => (
          <button
            key={e.id}
            type="button"
            className="tl-rail__btn"
            aria-current={i === active ? 'step' : undefined}
            onClick={() => onSelect(i)}
            style={{ ['--marker' as string]: e.color }}
          >
            <span className="tl-rail__title">{e.title}</span>
            <span className="tl-rail__year">{year(e.start)}</span>
          </button>
        ))}
      </nav>

      {/* Journey progress along the bottom edge. */}
      <div className="tl-progress" aria-hidden="true">
        <div className="tl-progress__fill" />
        {entries.map((e, i) => (
          <span
            key={e.id}
            className="tl-progress__tick"
            data-on={i <= active || undefined}
            style={{
              left: `${entries.length > 1 ? (i / (entries.length - 1)) * 100 : 0}%`,
              ['--marker' as string]: e.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function World({
  entries,
  progress,
  onSelect,
  onHover,
  onActive,
  onProgress,
}: SceneProps & { onActive: (index: number) => void; onProgress: (p: number) => void }) {
  const points = useMemo(() => layout(entries.length), [entries.length]);
  const curve = useMemo(() => new CatmullRomCurve3(points, false, 'catmullrom', 0.4), [points]);
  /** The drawn path runs a little past both ends so it fades into the fog. */
  const pathCurve = useMemo(() => {
    const before = points[0].clone().add(new Vector3(0, 0, SPACING * 1.2));
    const after = points[points.length - 1].clone().add(new Vector3(0, 0, -SPACING * 2.5));
    return new CatmullRomCurve3([before, ...points, after], false, 'catmullrom', 0.4);
  }, [points]);

  const eased = useRef(0);
  /** Scroll speed, 0 at rest. Drives FOV kick and particle speed. */
  const speed = useRef(0);
  const activeRef = useRef(-1);
  const target = useMemo(() => new Vector3(), []);
  const ahead = useMemo(() => new Vector3(), []);
  const camPos = useMemo(() => new Vector3(), []);
  const roll = useRef(0);
  const light = useRef<PointLight>(null);
  const colors = useMemo(() => entries.map((e) => new Color(e.color)), [entries]);
  const accent = useMemo(() => new Color(cssVar('--accent', '#ff5b2e')), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const prev = eased.current;
    eased.current = MathUtils.damp(eased.current, progress.current, 3.2, dt);
    const v = Math.abs(eased.current - prev) / Math.max(dt, 1e-4);
    speed.current = MathUtils.damp(speed.current, v, 6, dt);

    const u = MathUtils.clamp(eased.current, 0, 1);
    curve.getPoint(u, target);
    curve.getPoint(Math.min(u + 0.06, 1), ahead);

    camPos.copy(target).add(CAMERA_OFFSET);
    camPos.x += state.pointer.x * 0.8;
    camPos.y += state.pointer.y * 0.4;
    state.camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    // Look slightly ahead along the path, so motion reads as travel.
    ahead.lerp(target, 0.65);
    state.camera.lookAt(ahead);

    // Bank into the turns, and widen the lens a little while moving fast.
    const bank = MathUtils.clamp((ahead.x - target.x) * -0.08, -0.12, 0.12);
    roll.current = MathUtils.damp(roll.current, bank, 3, dt);
    state.camera.rotateZ(roll.current);
    const cam = state.camera as PerspectiveCamera;
    const fov = BASE_FOV + Math.min(speed.current * 40, 12);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = MathUtils.damp(cam.fov, fov, 5, dt);
      cam.updateProjectionMatrix();
    }

    // A coloured light rides with the camera target, tinting toward the current stop.
    const here = u * (entries.length - 1);
    const index = Math.round(here);
    if (light.current) {
      light.current.position.set(target.x, target.y + 2.5, target.z + 2);
      light.current.color.lerp(colors[index] ?? accent, 1 - Math.exp(-3 * dt));
    }

    onProgress(u);
    if (index !== activeRef.current) {
      activeRef.current = index;
      onActive(index);
    }
  });

  const mid = -((entries.length - 1) * SPACING) / 2;

  return (
    <>
      <color attach="background" args={[INK]} />
      <fog attach="fog" args={[INK, 9, 42]} />
      <ambientLight intensity={0.3} />
      <pointLight ref={light} intensity={45} distance={18} decay={1.6} />
      <directionalLight position={[-6, 8, 4]} intensity={0.6} />

      <Stars radius={80} depth={50} count={2200} factor={3.2} saturation={0} fade speed={0.5} />
      <Sparkles
        count={160}
        scale={[22, 7, entries.length * SPACING + 20]}
        position={[0, 1.2, mid]}
        size={2.2}
        speed={0.35}
        opacity={0.55}
        color={PAPER}
      />

      <Warmup />
      <Floor />
      <Path curve={pathCurve} eased={eased} accent={accent} curveAt={curve} />
      <FlowParticles curve={pathCurve} speed={speed} />

      {entries.map((e, i) => (
        <Station
          key={e.id}
          entry={e}
          index={i}
          count={entries.length}
          position={points[i]}
          eased={eased}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}

      <EffectComposer multisampling={4}>
        <Bloom intensity={0.95} luminanceThreshold={0.62} luminanceSmoothing={0.2} mipmapBlur />
        <Vignette offset={0.28} darkness={0.75} />
      </EffectComposer>
    </>
  );
}

/** Solid floor (hides the stars below the horizon) with an endless grid on top. */
function Floor() {
  return (
    <group position={[0, FLOOR, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <Grid
        args={[10, 10]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#34312c"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#4a463f"
        fadeDistance={38}
        fadeStrength={2}
        infiniteGrid
        followCamera
      />
    </group>
  );
}

/**
 * The route itself: a thin tube. The stretch already travelled glows in the accent
 * colour with pulses running along it; the road ahead is a dim dashed line.
 * "Travelled" is decided in world z, since the path always recedes along -z.
 */
function Path({
  curve,
  curveAt,
  eased,
  accent,
}: {
  curve: CatmullRomCurve3;
  curveAt: CatmullRomCurve3;
  eased: { current: number };
  accent: Color;
}) {
  const geometry = useMemo(() => new TubeGeometry(curve, 700, 0.035, 8, false), [curve]);
  const glowGeometry = useMemo(() => new TubeGeometry(curve, 700, 0.075, 8, false), [curve]);
  const head = useMemo(() => new Vector3(), []);

  const make = (glow: boolean) =>
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: glow ? AdditiveBlending : NormalBlending,
      uniforms: {
        uHeadZ: { value: 0 },
        uStartZ: { value: curveAt.points[0].z },
        uTime: { value: 0 },
        uDone: { value: accent.clone() },
        uTodo: { value: new Color(PAPER) },
        uFog: { value: new Color(INK) },
        uGlow: { value: glow ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        varying float vZ;
        varying float vDepth;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vZ = world.z;
          vec4 mv = viewMatrix * world;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uHeadZ, uStartZ, uTime, uGlow;
        uniform vec3 uDone, uTodo, uFog;
        varying float vZ;
        varying float vDepth;
        void main() {
          // Travelled = between the first stop and the camera's target (the path recedes along -z).
          // No pow() here: some GPU drivers return NaN for pow(0, y) or pow(negative, y),
          // and Bloom spreads a single NaN pixel into a completely black frame.
          float lead = clamp((vZ - uStartZ) / 0.4, 0.0, 1.0);
          float done = smoothstep(uHeadZ - 0.15, uHeadZ + 0.15, vZ) * (1.0 - lead * lead * (3.0 - 2.0 * lead));
          float dz = (vZ - uHeadZ) * 0.9;
          float head = exp(-dz * dz);
          float pf = fract(-vZ * 0.12 + uTime * 0.45);
          float p2 = pf * pf;
          float p4 = p2 * p2;
          float pulse = p4 * p4 * p4 * p2 * done; // pf^14
          float dash = step(0.45, fract(-vZ * 1.6 + uTime * 0.25));
          float fog = smoothstep(10.0, 44.0, vDepth);
          vec3 col;
          float a;
          if (uGlow > 0.5) {
            col = uDone * (0.12 * done + 0.5 * head + 0.35 * pulse);
            a = (0.25 * done + 0.6 * head + 0.5 * pulse) * (1.0 - fog) * smoothstep(2.0, 9.0, vDepth);
          } else {
            col = mix(uTodo * 0.55, uDone * 1.25, done) + uDone * pulse * 1.8 + vec3(1.0) * head * 0.8;
            a = mix(0.35 * dash + 0.1, 1.0, done) * (1.0 - fog) * smoothstep(1.5, 7.0, vDepth);
          }
          gl_FragColor = vec4(mix(col, uFog, fog), a);
        }`,
    });
  const material = useMemo(() => make(false), [accent]);
  const glowMaterial = useMemo(() => make(true), [accent]);

  useEffect(
    () => () => {
      geometry.dispose();
      glowGeometry.dispose();
      material.dispose();
      glowMaterial.dispose();
    },
    [geometry, glowGeometry, material, glowMaterial]
  );

  useFrame((state) => {
    curveAt.getPoint(MathUtils.clamp(eased.current, 0, 1), head);
    for (const m of [material, glowMaterial]) {
      m.uniforms.uHeadZ.value = head.z;
      m.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <>
      <mesh geometry={glowGeometry} material={glowMaterial} />
      <mesh geometry={geometry} material={material} />
    </>
  );
}

/** Motes streaming forward along the path; they rush when you scroll fast. */
function FlowParticles({ curve, speed }: { curve: CatmullRomCurve3; speed: { current: number } }) {
  const COUNT = 520;
  const table = useMemo(() => curve.getSpacedPoints(900), [curve]);
  const sprite = useMemo(() => dotTexture(), []);
  const { geometry, seeds } = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 3), 3));
    const s = Array.from({ length: COUNT }, () => ({
      t: Math.random(),
      v: 0.004 + Math.random() * 0.01,
      r: 0.25 + Math.pow(Math.random(), 1.6) * 2.6,
      a: Math.random() * Math.PI * 2,
      w: (Math.random() - 0.5) * 0.6,
    }));
    return { geometry: g, seeds: s };
  }, []);

  useEffect(() => () => (geometry.dispose(), sprite.dispose()), [geometry, sprite]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const boost = 1 + Math.min(speed.current * 60, 14);
    const pos = geometry.attributes.position as BufferAttribute;
    const n = table.length - 1;
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];
      s.t = (s.t + s.v * dt * boost) % 1;
      s.a += s.w * dt;
      const f = s.t * n;
      const k = Math.floor(f);
      const p0 = table[k];
      const p1 = table[Math.min(k + 1, n)];
      const fr = f - k;
      pos.setXYZ(
        i,
        p0.x + (p1.x - p0.x) * fr + Math.cos(s.a) * s.r,
        p0.y + (p1.y - p0.y) * fr + Math.sin(s.a) * s.r * 0.6,
        p0.z + (p1.z - p0.z) * fr
      );
    }
    pos.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={sprite}
        size={0.09}
        color={PAPER}
        transparent
        opacity={0.7}
        depthWrite={false}
        blending={AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

function CoreGeometry({ type }: { type: TimelineType }) {
  switch (type) {
    case 'education':
      return <octahedronGeometry args={[0.55, 0]} />;
    case 'job':
      return <boxGeometry args={[0.72, 0.72, 0.72]} />;
    case 'achievement':
      return <icosahedronGeometry args={[0.55, 0]} />;
    case 'move':
      return <torusKnotGeometry args={[0.32, 0.1, 96, 12]} />;
    default:
      return <icosahedronGeometry args={[0.48, 3]} />;
  }
}

function Station({
  entry,
  index,
  count,
  position,
  eased,
  onSelect,
  onHover,
}: {
  entry: TimelineEntryView;
  index: number;
  count: number;
  position: Vector3;
  eased: { current: number };
  onSelect: (index: number) => void;
  onHover: (entry: TimelineEntryView | null) => void;
}) {
  const group = useRef<Group>(null);
  const core = useRef<Group>(null);
  const shell = useRef<Mesh>(null);
  const ringA = useRef<Mesh>(null);
  const ringB = useRef<Mesh>(null);
  const orbit = useRef<Group>(null);
  const pad = useRef<Group>(null);
  const wave = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const yearPlane = useRef<Mesh>(null);
  const photo = useRef<Group>(null);
  const waveT = useRef(1);
  const wasHere = useRef(false);
  const lastLeave = useRef(1);
  const [hovered, setHovered] = useState(false);

  const color = useMemo(() => new Color(entry.color), [entry.color]);
  // Over 1 so Bloom adds a halo without bleaching light colours to white.
  const glow = useMemo(() => color.clone().multiplyScalar(1.6), [color]);
  const height = position.y - FLOOR;
  /** Photos float to the right; the info card owns the left of the screen. */
  const side = 1;

  const beamMaterial = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uColor: { value: color }, uFocus: { value: 0 }, uFade: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uFocus; uniform float uFade; varying vec2 vUv;
          void main(){
            float a = pow(max(1.0 - vUv.y, 1e-4), 2.2) * (0.05 + 0.2 * uFocus) * uFade; // pow(0, y) can be NaN on some GPUs
            gl_FragColor = vec4(uColor * 1.4, a);
          }`,
      }),
    [color]
  );
  useEffect(() => () => beamMaterial.dispose(), [beamMaterial]);

  useFrame((state, delta) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    const here = count > 1 ? eased.current * (count - 1) : 0;
    // 1 at this stop, falling to 0 one stop away.
    const focus = 1 - MathUtils.clamp(Math.abs(here - index), 0, 1);
    const f = MathUtils.smoothstep(focus, 0, 1);

    // Arrival: fire a shockwave across the floor.
    const isHere = focus > 0.9;
    if (isHere && !wasHere.current) waveT.current = 0;
    wasHere.current = isHere;

    if (core.current) {
      const s = MathUtils.damp(core.current.scale.x, 0.7 + f * 0.45 + (hovered ? 0.15 : 0), 8, delta);
      core.current.scale.setScalar(s);
      core.current.position.y = Math.sin(t * 0.8 + index) * 0.12;
      core.current.rotation.y += delta * (0.25 + f * 0.6);
      core.current.rotation.x = Math.sin(t * 0.4 + index) * 0.3;
    }
    if (shell.current) {
      shell.current.rotation.y -= delta * 0.4;
      shell.current.rotation.z += delta * 0.2;
      setDynamic(shell.current.material as Material, 0.15 + f * 0.45);
    }
    if (ringA.current) {
      ringA.current.rotation.z += delta * (0.3 + f * 0.9);
      ringA.current.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.5 + index) * 0.25;
      ringA.current.scale.setScalar(1 + f * 0.25);
    }
    if (ringB.current) {
      ringB.current.rotation.z -= delta * (0.2 + f * 0.6);
      ringB.current.rotation.y = Math.sin(t * 0.3 + index) * 0.5;
      setDynamic(ringB.current.material as Material, 0.2 + f * 0.5);
    }
    if (orbit.current) {
      orbit.current.rotation.y += delta * (0.6 + f * 0.8);
      orbit.current.scale.setScalar(0.6 + f * 0.6);
    }
    if (pad.current) {
      pad.current.rotation.z += delta * 0.15;
      pad.current.scale.setScalar(0.8 + f * 0.5 + Math.sin(t * 2 + index) * 0.03);
    }
    if (wave.current) {
      waveT.current = Math.min(waveT.current + delta * 0.7, 1);
      const w = waveT.current;
      wave.current.scale.setScalar(1 + w * 9);
      setDynamic(wave.current.material as Material, (1 - w) * 0.7);
    }
    beamMaterial.uniforms.uFocus.value = f;
    if (yearPlane.current) {
      // Fades in as you approach and out as you leave (one stop either way).
      setDynamic(yearPlane.current.material as Material, f * 0.32);
      yearPlane.current.position.y = 1.5 + (1 - f) * 0.5;
    }
    if (photo.current) {
      photo.current.position.y = 0.7 + (1 - f) * -0.8 + Math.sin(t * 0.6 + index) * 0.06;
      photo.current.rotation.y = side * -0.32 + state.pointer.x * 0.08;
      photo.current.scale.setScalar(0.75 + f * 0.25);
      photo.current.visible = f > 0.02;
      photo.current.children.forEach((c) => {
        const m = (c as Mesh).material as Material | undefined;
        if (m) setDynamic(m, f);
      });
    }

    // Leaving: a stop you've passed fades out completely by ~45% of the way to the next one,
    // well before the camera (which trails 7.5 units behind) flies through it.
    const leave = index < here ? MathUtils.clamp(1 - (here - index) * 2.2, 0, 1) : 1;
    beamMaterial.uniforms.uFade.value = leave;
    group.current.visible = leave > 0.005;
    if (group.current.visible && (leave < 1 || lastLeave.current < 1)) {
      group.current.traverse((o) => {
        const m = (o as Mesh).material as Material | undefined;
        if (!m || m === beamMaterial) return;
        if (m.userData.baseOpacity === undefined) {
          m.userData.baseOpacity = m.opacity;
          m.transparent = true; // opacity has no effect on opaque materials
        }
        // Dynamic materials were just written this frame; static ones scale their original opacity.
        m.opacity = (m.userData.dynamic ? m.opacity : m.userData.baseOpacity) * leave;
      });
    }
    lastLeave.current = leave;
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    onHover(entry);
  };
  const out = () => {
    setHovered(false);
    onHover(null);
  };

  return (
    <group ref={group} position={position}>
      {/* Core shape (by entry type), with a wireframe shell. */}
      <group ref={core}>
        <mesh onClick={() => onSelect(index)} onPointerOver={over} onPointerOut={out}>
          <CoreGeometry type={entry.type} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.55}
            roughness={0.25}
            metalness={0.35}
            flatShading
            transparent
          />
        </mesh>
        <mesh ref={shell} scale={1.45}>
          <CoreGeometry type={entry.type} />
          <meshBasicMaterial color={glow} wireframe transparent opacity={0.3} toneMapped={false} />
        </mesh>
      </group>

      <mesh ref={ringA}>
        <torusGeometry args={[1.05, 0.012, 8, 128]} />
        <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <mesh ref={ringB}>
        <torusGeometry args={[1.35, 0.006, 6, 128]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.3} />
      </mesh>

      {/* Three small satellites. */}
      <group ref={orbit} rotation={[0.5, 0, 0.3]}>
        {[0, 1, 2].map((k) => {
          const a = (k / 3) * Math.PI * 2;
          return (
            <mesh key={k} position={[Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7]}>
              <sphereGeometry args={[0.045 + k * 0.012, 12, 12]} />
              <meshBasicMaterial color={k === 0 ? glow : PAPER} toneMapped={false} />
            </mesh>
          );
        })}
      </group>

      {/* Beam of light from the floor up to the station. */}
      <mesh ref={beam} position={[0, -height / 2, 0]} material={beamMaterial}>
        <cylinderGeometry args={[0.06, 0.7, height, 32, 1, true]} />
      </mesh>
      <mesh position={[0, -height / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.012, height, 6]} />
        <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.6} />
      </mesh>

      {/* Landing pad and arrival shockwave on the floor. */}
      <group position={[0, -height + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <group ref={pad}>
          <mesh>
            <ringGeometry args={[0.95, 1.02, 96]} />
            <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.8} />
          </mesh>
          <mesh>
            <ringGeometry args={[1.45, 1.47, 96, 1, 0, Math.PI * 1.5]} />
            <meshBasicMaterial color={PAPER} transparent opacity={0.35} />
          </mesh>
          <mesh>
            <circleGeometry args={[0.95, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.08} />
          </mesh>
        </group>
        <mesh ref={wave}>
          <ringGeometry args={[0.98, 1.0, 128]} />
          <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0} />
        </mesh>
      </group>

      <YearPlane meshRef={yearPlane} text={year(entry.start)} color={entry.color} />
      {entry.image && <Photo groupRef={photo} url={entry.image} side={side} />}
    </group>
  );
}

/** Huge outlined year floating behind each station, drawn to a canvas texture. */
function YearPlane({
  text,
  color,
  meshRef,
}: {
  text: string;
  color: string;
  meshRef: React.RefObject<Mesh | null>;
}) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let tex: CanvasTexture | null = null;
    let cancelled = false;
    // Wait for the self-hosted display font, or the canvas would fall back to a system font.
    document.fonts.ready.then(() => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      const font = cssVar('--ff-display', 'sans-serif');
      ctx.font = `800 330px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const grad = ctx.createLinearGradient(0, 40, 0, 360);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(238,234,225,0.05)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.07;
      ctx.fillText(text, 512, 210);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.strokeText(text, 512, 210);
      tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      setTexture(tex);
    });
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [text, color]);

  if (!texture) return null;
  return (
    <mesh ref={meshRef} position={[0, 1.5, -3.2]}>
      <planeGeometry args={[7.2, 2.8]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} opacity={0.1} />
    </mesh>
  );
}

/** The entry's photo as a framed print floating beside the station. */
function Photo({ url, side, groupRef }: { url: string; side: number; groupRef: React.RefObject<Group | null> }) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let tex: Texture | null = null;
    let cancelled = false;
    new TextureLoader().load(url, (t) => {
      if (cancelled) return t.dispose();
      t.colorSpace = SRGBColorSpace;
      tex = t;
      setTexture(t);
    });
    return () => {
      cancelled = true;
      tex?.dispose();
    };
  }, [url]);

  if (!texture) return null;
  const w = 2.5;
  const h = w / 1.5;
  return (
    <group ref={groupRef} position={[side * 2.9, 0.7, 0.6]}>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[w + 0.12, h + 0.12]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0} />
      </mesh>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}
