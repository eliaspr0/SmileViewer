/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Columns2, Pause, Play, Repeat, Upload } from "lucide-react";

type Side = "before" | "after";
type ViewName = "Front" | "Top" | "Bottom" | "Left" | "Right";
const VIEWS: ViewName[] = ["Front", "Top", "Bottom", "Left", "Right"];

type Api = {
  load: (side: Side, bufs: ArrayBuffer[], names?: string[]) => void;
  setView: (v: ViewName) => void;
  setBlend: (t: number) => void;
  setSplit: (s: boolean) => void;
};

function ViewIcon({ v }: { v: ViewName }) {
  const p = { width: 28, height: 28, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (v === "Front") return (
    <svg {...p}><path d="M4 12h24" /><rect x="5" y="12" width="5" height="9" rx="2" /><rect x="10" y="12" width="6" height="11" rx="2" /><rect x="16" y="12" width="6" height="11" rx="2" /><rect x="22" y="12" width="5" height="9" rx="2" /></svg>
  );
  if (v === "Top") return (
    <svg {...p}><path d="M7 26V14a9 9 0 0 1 18 0v12" /><path d="M12 26V15a4 4 0 0 1 8 0v11" /><path d="M16 3v3M13.5 4.5 16 6l2.5-1.5" /></svg>
  );
  if (v === "Bottom") return (
    <svg {...p}><path d="M7 6v12a9 9 0 0 0 18 0V6" /><path d="M12 6v11a4 4 0 0 0 8 0V6" /><path d="M16 29v-3M13.5 27.5 16 26l2.5 1.5" /></svg>
  );
  const flip = v === "Right" ? "scale(-1 1) translate(-32 0)" : undefined;
  return (
    <svg {...p}><g transform={flip}><path d="M6 13h18a3 3 0 0 1 3 3v0" /><path d="M6 13c0 5 2 8 5 8h10c3 0 5-2 6-5" /><path d="M10 13v8M15 13v8M20 13v8" /><path d="M3 7l3 3 3-3" /></g></svg>
  );
}

export function StlCompare() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [loaded, setLoaded] = useState<Record<Side, string[]>>({ before: [], after: [] });
  const [split, setSplit] = useState(true);
  const [view, setView] = useState<ViewName>("Front");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAny = loaded.before.length > 0 || loaded.after.length > 0;
  const hasBoth = loaded.before.length > 0 && loaded.after.length > 0;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { TrackballControls } = await import("three/examples/jsm/controls/TrackballControls.js");
      const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
      const el = hostRef.current;
      if (disposed || !el) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.autoClear = false;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10000);
      const controls: any = new TrackballControls(camera, renderer.domElement);
      controls.rotateSpeed = 1.8;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.6;
      // right button rotates, middle-button drag pans, scroll wheel zooms
      controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE } as any;
      renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

      const makeScene = () => {
        const s = new THREE.Scene();
        s.add(new THREE.HemisphereLight(0xffffff, 0xb8aea4, 1.5));
        return s;
      };
      const scenes: Record<Side, any> = { before: makeScene(), after: makeScene() };
      const groups: Record<Side, any> = { before: new THREE.Group(), after: new THREE.Group() };
      scenes.before.add(groups.before);
      scenes.after.add(groups.after);
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(0.3, 0.4, 1);
      camera.add(key);
      // camera can only have one parent; give each scene its own head-light clone
      const key2 = key.clone();
      const rig = { before: key, after: key2 };
      scenes.before.add(camera);

      // extra crease/edge darkening so tooth gaps and gumline folds read clearly
      const SHADE = 0.6;
      const material = (opacity = 1) => {
        const m = new THREE.MeshStandardMaterial({
          color: 0xe9cd95, roughness: 0.75, metalness: 0,
          transparent: true, opacity,
        });
        const u = { uShade: { value: SHADE } };
        m.onBeforeCompile = (sh: any) => {
          Object.assign(sh.uniforms, u);
          sh.vertexShader = sh.vertexShader
            .replace(
              "void main() {",
              "varying vec3 vCreaseN;\nvarying vec3 vCreaseV;\nvoid main() {",
            )
            .replace(
              "#include <project_vertex>",
              "#include <project_vertex>\nvCreaseN = normalize(normalMatrix * normal);\nvec4 creaseMV = modelViewMatrix * vec4(position, 1.0);\nvCreaseV = normalize(-creaseMV.xyz);",
            );
          sh.fragmentShader = sh.fragmentShader
            .replace(
              "void main() {",
              "uniform float uShade;\nvarying vec3 vCreaseN;\nvarying vec3 vCreaseV;\nvoid main() {",
            )
            .replace(
              "#include <map_fragment>",
              "#include <map_fragment>\nfloat creaseNdv = clamp(dot(normalize(vCreaseN), normalize(vCreaseV)), 0.0, 1.0);\ndiffuseColor.rgb *= mix(1.0, smoothstep(0.0, 0.6, creaseNdv), uShade);",
            );
        };
        return m;
      };
      const mats: Record<Side, any> = { before: material(1), after: material(0) };

      let state = { blend: 0, split: false };
      let radius = 40;
      const center = new THREE.Vector3();
      const loader = new STLLoader();

      const recenter = () => {
        const box = new THREE.Box3();
        (["before", "after"] as Side[]).forEach((s) => { if (groups[s].children.length) box.expandByObject(groups[s]); });
        if (box.isEmpty()) return;
        box.getCenter(center);
        radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      };

      // These STL scans are Y-up with the front of the arch toward +Z.
      const dirs: Record<ViewName, [number, number, number, number, number, number]> = {
        Front: [0, 0, 1, 0, 1, 0],
        Top: [0, -1, 0, 0, 0, 1],
        // lower jaw: seen from above, so the upward-facing teeth fill the screen
        Bottom: [0, 1, 0, 0, 0, 1],
        Left: [1, 0, 0, 0, 1, 0],
        Right: [-1, 0, 0, 0, 1, 0],
      };
      let anim: { from: any; to: any; fromUp: any; toUp: any; start: number } | null = null;
      const setView = (v: ViewName, instant = false) => {
        const [x, y, z, ux, uy, uz] = dirs[v];
        const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * (state.split ? 1.6 : 1.1);
        const to = new THREE.Vector3(x, y, z).multiplyScalar(dist).add(center);
        const toUp = new THREE.Vector3(ux, uy, uz);
        controls.target.copy(center);
        if (instant) { camera.position.copy(to); camera.up.copy(toUp); camera.lookAt(center); camera.updateMatrix(); return; }
        anim = { from: camera.position.clone(), to, fromUp: camera.up.clone(), toUp, start: performance.now() };
      };
      let currentView: ViewName = "Front";
      // the Top view shows only the maxillary (upper) arch,
      // the Bottom view shows only the mandibular (lower) arch
      const applyJawFilter = () => {
        (["before", "after"] as Side[]).forEach((s) => groups[s].children.forEach((m: any) => {
          const upper = m.userData.upper;
          if (currentView === "Top") m.visible = upper !== false;
          else if (currentView === "Bottom") m.visible = upper !== true;
          else m.visible = true;
        }));
      };

      const resize = () => {
        renderer.setSize(el.clientWidth, el.clientHeight);
        controls.handleResize();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      apiRef.current = {
        load(side, bufs, names) {
          const firstLoad = !groups.before.children.length && !groups.after.children.length;
          groups[side].children.slice().forEach((m: any) => { groups[side].remove(m); m.geometry.dispose(); });
          const meshes = bufs.map((b, i) => {
            const g = loader.parse(b);
            g.computeVertexNormals();
            g.computeBoundingBox();
            const m = new THREE.Mesh(g, mats[side]);
            m.userData["name"] = (names?.[i] || "").toLowerCase();
            m.userData["cy"] = (g.boundingBox!.min.y + g.boundingBox!.max.y) / 2;
            groups[side].add(m);
            return m;
          });
          // tag the upper jaw: by filename first, otherwise the highest scan (Y-up)
          const upRe = /(upper|maxil|oberkiefer|\bup\b|[_\-\s]u[_\-.\s]|_u$)/;
          const lowRe = /(lower|mandib|unterkiefer|\blow\b|[_\-\s]l[_\-.\s]|_l$)/;
          const maxY = Math.max(...meshes.map((m: any) => m.userData.cy));
          meshes.forEach((m: any) => {
            const n = m.userData.name;
            m.userData.upper = upRe.test(n) ? true : lowRe.test(n) ? false : meshes.length === 1 || m.userData.cy === maxY;
          });
          applyJawFilter();
          recenter();
          setView(currentView, firstLoad);
        },
        setView(v) { currentView = v; applyJawFilter(); setView(v); },
        setBlend(b) { state.blend = b; },
        setSplit(s) { state.split = s; setView(currentView); },
      };
      // apply the current React state once the 3D engine is ready
      // (the mount-time effect ran before apiRef existed)
      apiRef.current.setSplit(split);

      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (anim) {
          const k = Math.min(1, (performance.now() - anim.start) / 600);
          const e = 1 - Math.pow(1 - k, 3);
          const fromDir = anim.from.clone().sub(center);
          const toDir = anim.to.clone().sub(center);
          const len = fromDir.length() + (toDir.length() - fromDir.length()) * e;
          const dir = fromDir.normalize().lerp(toDir.clone().normalize(), e);
          if (dir.lengthSq() < 1e-6) dir.copy(toDir).normalize();
          camera.position.copy(center).add(dir.normalize().multiplyScalar(len));
          camera.up.copy(anim.fromUp).lerp(anim.toUp, e).normalize();
          camera.lookAt(center);
          camera.updateMatrix();
          if (k >= 1) anim = null;
        }
        if (!anim) controls.update();
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setScissorTest(true);
        renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
        renderer.clear();
        const draw = (side: Side, x: number, vw: number) => {
          camera.aspect = vw / h; camera.updateProjectionMatrix();
          scenes[side].add(camera); camera.add(rig[side]);
          renderer.setViewport(x, 0, vw, h); renderer.setScissor(x, 0, vw, h);
          renderer.render(scenes[side], camera);
        };
        if (state.split) {
          mats.before.opacity = 1; mats.after.opacity = 1;
          mats.before.depthWrite = mats.after.depthWrite = true;
          draw("before", 0, w / 2);
          renderer.clearDepth();
          draw("after", w / 2, w / 2);
        } else {
          const b = state.blend;
          const hasB = groups.before.children.length, hasA = groups.after.children.length;
          mats.before.opacity = hasA ? 1 - b : 1;
          mats.after.opacity = hasB ? b : 1;
          // draw the dominant stage first, opaque-ish, then fade the other over it
          const order: Side[] = b < 0.5 ? ["before", "after"] : ["after", "before"];
          order.forEach((s, i) => {
            mats[s].depthWrite = i === 0;
            if (mats[s].opacity > 0.01) draw(s, 0, w);
          });
        }
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  // play: the bar always measures exactly one starter -> final pass.
  // with loop on, the next pass restarts the bar from 0 rather than
  // the bar growing to cover a second pass.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let cur = 0;
    setT(0);
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      cur = Math.min(1, cur + dt / 4);
      setT(cur);
      if (cur >= 1) {
        if (loopRef.current) { cur = 0; setT(0); raf = requestAnimationFrame(step); return; }
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => { apiRef.current?.setBlend(t); }, [t]);
  useEffect(() => { loopRef.current = loop; }, [loop]);
  useEffect(() => { apiRef.current?.setSplit(split); }, [split]);

  const loadFiles = async (side: Side, files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".stl"));
    if (!list.length) { setError("Please drop .stl files."); return; }
    setError(null);
    try {
      const bufs = await Promise.all(list.map((f) => f.arrayBuffer()));
      apiRef.current?.load(side, bufs, list.map((f) => f.name));
      setLoaded((p) => ({ ...p, [side]: list.map((f) => f.name) }));
      if (side === "after") { setT(1); }
    } catch {
      setError("One of those files couldn't be read as an STL scan.");
    }
  };

  const DropSlot = ({ side, label }: { side: Side; label: string }) => (
    <label
      className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-si-border bg-card/80 p-6 text-center transition-colors hover:border-si-green data-[over=true]:border-si-green data-[over=true]:bg-si-green/10"
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.dataset["over"] = "true"; }}
      onDragLeave={(e) => { e.currentTarget.dataset["over"] = "false"; }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.dataset["over"] = "false"; setDragging(false); setPicker(false); loadFiles(side, e.dataTransfer.files); }}
    >
      <Upload className="h-6 w-6 text-si-green" />
      <span className="text-base font-bold text-foreground">{label}</span>
      <span className="text-sm text-muted-foreground">
        {loaded[side].length ? loaded[side].join(", ") : "Drop STL file(s) here or click to browse"}
      </span>
      <input type="file" accept=".stl" multiple className="hidden" aria-label={`Open ${label} STL`}
        onChange={(e) => { setPicker(false); if (e.target.files) loadFiles(side, e.target.files); }} />
    </label>
  );

  return (
    <div
      className="relative flex h-screen w-full flex-col items-center overflow-hidden bg-si-bg font-si"
      onDragEnter={(e) => { if (e.dataTransfer.types.includes("Files")) setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); setDragging(false); }}
    >
      {/* top controls */}
      <div className="z-10 mt-3 flex items-center gap-3 rounded-2xl bg-card px-7 py-3 shadow-si">
        <Columns2 className="h-5 w-5 text-foreground" />
        <span className="text-[17px] font-bold text-foreground">Before &amp; After</span>
        <button
          role="switch" aria-checked={split} aria-label="Before and after side by side"
          onClick={() => setSplit((s) => !s)}
          className={`relative h-6 w-12 rounded-full transition-colors ${split ? "bg-si-green" : "bg-si-border"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${split ? "left-[26px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* viewer */}
      <div className="relative w-full flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        {split && hasAny && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-si-border" />
            <div className="pointer-events-none absolute inset-x-0 top-16 flex text-sm font-semibold text-muted-foreground">
              <span className="flex-1 text-center">Starter Smile</span>
              <span className="flex-1 text-center">Final Smile</span>
            </div>
          </>
        )}
        {(["before", "after"] as Side[]).map((s, i) => (!loaded[s].length || dragging || picker) && (
          <div key={s} className={`absolute inset-y-0 z-20 flex w-1/2 items-center justify-center p-10 ${i === 0 ? "left-0 pl-24" : "right-0"}`}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}>
            <div className="flex h-64 w-full max-w-sm">
              <DropSlot side={s} label={s === "before" ? "Starter Smile" : "Final Smile"} />
            </div>
          </div>
        ))}
        {hasBoth && (
          <button onClick={() => setPicker((v) => !v)}
            className="absolute right-6 top-2 z-30 flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-si hover:bg-muted">
            <Upload className="h-4 w-4" /> {picker ? "Close" : "Open scans"}
          </button>
        )}
        {error && <p className="absolute bottom-2 left-0 right-0 z-30 text-center text-sm text-destructive">{error}</p>}

        {/* view buttons */}
        <div className="absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-si-border bg-card p-1 shadow-si">
          {VIEWS.map((v) => (
            <button key={v} title={v} aria-label={`${v} view`}
              onClick={() => { setView(v); apiRef.current?.setView(v); }}
              className={`flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${view === v ? "bg-si-green text-primary-foreground" : "text-foreground hover:bg-muted"}`}
            ><ViewIcon v={v} /></button>
          ))}
        </div>
      </div>

      {/* timeline: hidden while Before & After split mode is on */}
      {!split && (
        <div className="z-10 mb-12 flex w-[min(860px,92vw)] items-center gap-6 rounded-xl bg-si-panel px-6 pb-3 pt-3">
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-si-green">
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button onClick={() => setLoop((l) => !l)} title="Loop" aria-label="Loop playback" aria-pressed={loop}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${loop ? "bg-si-green text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
            <Repeat className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <input type="range" min={0} max={1000} value={Math.round(t * 1000)}
              onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000); }}
              aria-label="Treatment progress"
              className="si-range w-full"
              style={{ ["--p" as any]: `${t * 100}%` }} />
            <div className="mt-1 flex justify-between text-[13px] text-foreground">
              <button type="button" onClick={() => { setPlaying(false); setT(0); }} className="hover:text-[var(--si-green)]">Starter Smile</button>
              <button type="button" onClick={() => { setPlaying(false); setT(1); }} className="hover:text-[var(--si-green)]">Final Smile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
