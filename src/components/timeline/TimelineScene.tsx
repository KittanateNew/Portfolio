/**
 * 3D life timeline. Entries sit along a winding path; scroll progress (0–1, written
 * into `progress.current` by ScrollTrigger) flies the camera from one to the next.
 * Loaded on demand by Timeline.astro, never on touch / low-power / reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Line, Stars } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { CanvasTexture, CatmullRomCurve3, Color, MathUtils, SRGBColorSpace, Vector3, type Group } from 'three';
import type { TimelineEntryView } from '../../lib/types';
import { monthYear, year } from '../../lib/types';

export interface SceneProps {
  entries: TimelineEntryView[];
  /** Mutable scroll progress, 0–1. Read every frame, never triggers a React render. */
  progress: { current: number };
  onSelect: (index: number) => void;
  onHover: (entry: TimelineEntryView | null) => void;
}

const INK = '#141311';
const SPACING = 9;
/** Where the camera sits relative to the point it looks at. */
const CAMERA_OFFSET = new Vector3(0, 1.4, 8);

/** Marker positions: a gentle zig-zag receding into the distance. */
function layout(count: number) {
  return Array.from(
    { length: count },
    (_, i) => new Vector3(Math.sin(i * 1.15) * 3.4, Math.cos(i * 0.85) * 1.1, -i * SPACING)
  );
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

  return (
    <div ref={wrap} className="tl-scene">
      <Canvas
        className="tl-scene__canvas"
        dpr={[1, 1.75]}
        frameloop={visible ? 'always' : 'never'}
        camera={{ fov: 45, near: 0.1, far: 120, position: [0, 1.4, 8] }}
        gl={{ powerPreference: 'high-performance' }}
        aria-hidden="true"
      >
        <World entries={entries} progress={progress} onSelect={onSelect} onHover={onHover} onActive={setActive} />
      </Canvas>

      {entry && (
        <article key={entry.id} className="tl-card" aria-hidden="true">
          <p className="tl-card__index">
            {pad(active + 1)} / {pad(entries.length)}
          </p>
          <p className="tl-card__year" style={{ color: entry.color }}>
            {year(entry.start)}
          </p>
          <h3 className="tl-card__title">{entry.title}</h3>
          <p className="tl-card__meta">
            {monthYear(entry.start)}
            {entry.end && ` – ${monthYear(entry.end)}`}
            {entry.location && ` · ${entry.location}`}
          </p>
          {entry.description && <p className="tl-card__desc">{entry.description}</p>}
          {entry.image && <img className="tl-card__img" src={entry.image} alt="" />}
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
            <span className="tl-rail__year">{year(e.start)}</span>
            <span className="tl-rail__title">{e.title}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function World({
  entries,
  progress,
  onSelect,
  onHover,
  onActive,
}: SceneProps & { onActive: (index: number) => void }) {
  const points = useMemo(() => layout(entries.length), [entries.length]);
  const curve = useMemo(() => new CatmullRomCurve3(points, false, 'catmullrom', 0.4), [points]);
  const pathPoints = useMemo(() => {
    // Extend the drawn line a little past both ends so it fades into the fog.
    const before = points[0].clone().add(new Vector3(0, 0, SPACING * 0.8));
    const after = points[points.length - 1].clone().add(new Vector3(0, 0, -SPACING * 2));
    return new CatmullRomCurve3([before, ...points, after], false, 'catmullrom', 0.4).getPoints(400);
  }, [points]);

  /** Smoothed progress shared with the markers. */
  const eased = useRef(0);
  const activeRef = useRef(-1);
  const target = useMemo(() => new Vector3(), []);
  const camPos = useMemo(() => new Vector3(), []);

  useFrame((state, delta) => {
    eased.current = MathUtils.damp(eased.current, progress.current, 3.5, Math.min(delta, 0.1));
    // Markers sit at equal steps of the curve's parameter, so map progress to that.
    const u = MathUtils.clamp(eased.current, 0, 1);
    curve.getPoint(u, target);
    camPos.copy(target).add(CAMERA_OFFSET);
    camPos.x += state.pointer.x * 0.7;
    camPos.y += state.pointer.y * 0.35;
    state.camera.position.lerp(camPos, 1 - Math.exp(-6 * delta));
    state.camera.lookAt(target);

    const index = Math.round(u * (entries.length - 1));
    if (index !== activeRef.current) {
      activeRef.current = index;
      onActive(index);
    }
  });

  return (
    <>
      <color attach="background" args={[INK]} />
      <fog attach="fog" args={[INK, 7, 34]} />
      <ambientLight intensity={0.35} />
      <pointLight position={[4, 6, 4]} intensity={40} />

      <Stars radius={70} depth={60} count={1800} factor={3} saturation={0} fade speed={0.4} />
      <Line points={pathPoints} color="#eeeae1" transparent opacity={0.22} lineWidth={1} />

      {entries.map((e, i) => (
        <Marker
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
        <Bloom intensity={0.6} luminanceThreshold={0.8} luminanceSmoothing={0.15} mipmapBlur />
      </EffectComposer>
    </>
  );
}

function Marker({
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
  const ring = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const color = useMemo(() => new Color(entry.color), [entry.color]);
  // Slightly over 1 so Bloom adds a halo without bleaching light colours to white.
  const glow = useMemo(() => color.clone().multiplyScalar(1.35), [color]);

  useFrame((state, delta) => {
    if (!group.current || !ring.current) return;
    // 1 when this is the current stop, falling to 0 one stop away.
    const here = count > 1 ? eased.current * (count - 1) : 0;
    const focus = 1 - MathUtils.clamp(Math.abs(here - index), 0, 1);
    const s = MathUtils.damp(group.current.scale.x, 0.65 + focus * 0.3 + (hovered ? 0.15 : 0), 8, delta);
    group.current.scale.setScalar(s);
    group.current.position.y = position.y + Math.sin(state.clock.elapsedTime * 0.8 + index) * 0.12;
    ring.current.rotation.z += delta * (0.3 + focus * 0.9);
    ring.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5 + index) * 0.4;
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
      <mesh onClick={() => onSelect(index)} onPointerOver={over} onPointerOut={out}>
        <icosahedronGeometry args={[0.42, 3]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} roughness={0.4} />
      </mesh>
      <group ref={ring}>
        <mesh>
          <torusGeometry args={[0.85, 0.012, 8, 96]} />
          <meshBasicMaterial color={glow} toneMapped={false} transparent opacity={0.8} />
        </mesh>
      </group>
      <Label text={year(entry.start)} />
    </group>
  );
}

/**
 * Year under a marker, drawn to a canvas texture. (drei's <Html> mounts a React root
 * per label, which errors when the island is torn down during a page transition.)
 */
function Label({ text }: { text: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const font = getComputedStyle(document.documentElement).getPropertyValue('--ff-mono').trim() || 'monospace';
    ctx.font = `28px ${font}`;
    ctx.fillStyle = '#a9a398';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';
    ctx.fillText(text, 128, 32);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [text]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite position={[0, -1.25, 0]} scale={[1.6, 0.4, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}
