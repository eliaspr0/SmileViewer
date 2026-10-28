/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Columns2, Pause, Play, Upload } from "lucide-react";

type Side = "before" | "after";
type ViewName = "Front" | "Top" | "Bottom" | "Left" | "Right";
const VIEWS: ViewName[] = ["Front", "Top", "Bottom", "Left", "Right"];

type Api = {
  load: (side: Side, bufs: ArrayBuffer[]) => void;
  setView: (v: ViewName) => void;
  setBlend: (t: number) => void;
  setSplit: (s: boolean) => void;
};

export function StlCompare() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const [loaded, setLoaded] = useState<Record<Side, string[]>>({ before: [], after: [] });
  const [split, setSplit] = useState(false);
  const [view, setView] = useState<ViewName>("Front");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAny = loaded.before.length > 0 || loaded.after.length > 0;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { ArcballControls } = await import("three/examples/jsm/controls/ArcballControls.js");
      const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
      const el = hostRef.current;
      if (disposed || !el) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.autoClear = false;
      el.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";

      // World is true Z-up (dental scanner convention): +Z occlusal/up, -Y facial/front.
      const WORLD_UP = new THREE.Vector3(0, 0, 1);
      THREE.Object3D.DEFAULT_UP.copy(WORLD_UP);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10000);
      const controls: any = new ArcballControls(camera, renderer.domElement);
      controls.setGizmosVisible(false);
      controls.cursorZoom = true;
      controls.adjustNearFar = true;
      [[0, "CTRL"], [0, null], [1, "SHIFT"], [1, null], [2, null]].forEach(([b, k]) =>
        controls.unsetMouseAction(b as any, k as any));
      controls.setMouseAction("ROTATE", 2);
      controls.setMouseAction("PAN", 1);
      renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

      const makeScene = () => {
        const s = new THREE.Scene();
        const hemi = new THREE.HemisphereLight(0xffffff, 0x9a8f8a, 1.1);
        hemi.position.copy(WORLD_UP); // sky from +Z, ground from -Z
        s.add(hemi);
        return s;
      };
      const scenes: Record<Side, any> = { before: makeScene(), after: makeScene() };
      const groups: Record<Side, any> = { before: new THREE.Group(), after: new THREE.Group() };
      scenes.before.add(groups.before);
      scenes.after.add(groups.after);
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(0.3, 0.4, 1);
      camera.add(key);
      // camera can only have one parent; give each scene its own head-light clone
      const key2 = key.clone();
      const rig = { before: key, after: key2 };
      scenes.before.add(camera);

      const material = (opacity = 1) =>
        new THREE.MeshPhysicalMaterial({
          color: 0xad8d5f, roughness: 0.32, metalness: 0, clearcoat: 0, clearcoatRoughness: 0,
          transparent: true, opacity,
        });
      const mats: Record<Side, any> = { before: material(1), after: material(0) };

      let state = { blend: 0, split: false };
      let radius = 40;
      const center = new THREE.Vector3();
      const loader = new STLLoader();

      // Keep the STL coordinates intact so scans do not get baked into a shared origin.
      // We still use the combined bounding box for framing and camera motion, but do not
      // translate each geometry in-place, which causes the models to lock together.
      const recenter = () => {
        const meshes: any[] = [...groups.before.children, ...groups.after.children];
        if (!meshes.length) return;
        const box = new THREE.Box3();
        meshes.forEach((m) => { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); });
        box.getCenter(center);
        radius = box.getBoundingSphere(new THREE.Sphere()).radius;
      };

      // STL dental scans are usually Z-up with the front of the arch toward -Y.
      const dirs: Record<ViewName, [number, number, number, number, number, number]> = {
        Front: [0, -1, 0, 0, 0, 1],
        Top: [0, 0, 1, 0, 1, 0],
        Bottom: [0, 0, -1, 0, -1, 0],
        Left: [-1, 0, 0, 0, 0, 1],
        Right: [1, 0, 0, 0, 0, 1],
      };
      let anim: { from: any; to: any; fromUp: any; toUp: any; start: number } | null = null;
      const setView = (v: ViewName, instant = false) => {
        const [x, y, z, ux, uy, uz] = dirs[v];
        const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * (state.split ? 1.6 : 1.1);
        const to = new THREE.Vector3(x, y, z).multiplyScalar(dist).add(center);
        const toUp = new THREE.Vector3(ux, uy, uz);
        controls.target.copy(center);
        if (instant) { camera.position.copy(to); camera.up.copy(toUp); camera.lookAt(center); camera.updateMatrix(); controls.setCamera(camera); return; }
        anim = { from: camera.position.clone(), to, fromUp: camera.up.clone(), toUp, start: performance.now() };
      };
      let currentView: ViewName = "Front";

      const resize = () => {
        renderer.setSize(el.clientWidth, el.clientHeight);
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      apiRef.current = {
        load(side, bufs) {
          const firstLoad = !groups.before.children.length && !groups.after.children.length;
          groups[side].children.slice().forEach((m: any) => { groups[side].remove(m); m.geometry.dispose(); });
          bufs.forEach((b) => {
            const g = loader.parse(b);
            g.computeVertexNormals();
            groups[side].add(new THREE.Mesh(g, mats[side]));
          });
          recenter();
          setView(currentView, firstLoad);
        },
        setView(v) { currentView = v; setView(v); },
        setBlend(b) { state.blend = b; },
        setSplit(s) { state.split = s; setView(currentView); },
      };

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
          if (k >= 1) { anim = null; controls.setCamera(camera); }
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

  // play: sweep current -> new smile, then hold and loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setT((p) => (p >= 1 ? 0 : Math.min(1, p + dt / 4)));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => { apiRef.current?.setBlend(t); }, [t]);
  useEffect(() => { apiRef.current?.setSplit(split); }, [split]);

  const loadFiles = async (side: Side, files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith(".stl"));
    if (!list.length) { setError("Please drop .stl files."); return; }
    setError(null);
    try {
      const bufs = await Promise.all(list.map((f) => f.arrayBuffer()));
      apiRef.current?.load(side, bufs);
      setLoaded((p) => ({ ...p, [side]: list.map((f) => f.name) }));
      if (side === "after") { setT(1); }
    } catch {
      setError("One of those files couldn't be read as an STL scan.");
    }
  };

  const DropSlot = ({ side, label }: { side: Side; label: string }) => (
    <label
      className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-si-border bg-card/80 p-6 text-center transition-colors hover:border-si-green/80 hover:bg-card"
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
          <div className="pointer-events-none absolute inset-x-0 top-2 flex text-sm font-semibold text-muted-foreground">
            <span className="flex-1 text-center">Current smile</span>
            <span className="flex-1 text-center">New smile</span>
          </div>
        )}
        {(!hasAny || dragging || picker) && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-8"
            onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}>
            <div className="flex w-full max-w-3xl gap-6">
              <DropSlot side="before" label="Current smile" />
              <DropSlot side="after" label="New smile" />
            </div>
          </div>
        )}
        {hasAny && (
          <button onClick={() => setPicker((v) => !v)}
            className="absolute right-6 top-2 z-30 flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-si hover:bg-muted">
            <Upload className="h-4 w-4" /> {picker ? "Close" : "Open scans"}
          </button>
        )}
        {error && <p className="absolute bottom-2 left-0 right-0 z-30 text-center text-sm text-destructive">{error}</p>}
      </div>

      {/* view buttons */}
      <div className="z-10 mb-5 flex overflow-hidden rounded-lg border border-si-border bg-card">
        {VIEWS.map((v) => (
          <button key={v}
            onClick={() => { setView(v); apiRef.current?.setView(v); }}
            className={`w-[92px] py-3 text-[17px] font-bold transition-colors ${view === v ? "rounded-lg bg-si-green text-primary-foreground" : "text-foreground hover:bg-muted"}`}
          >{v}</button>
        ))}
      </div>

      {/* timeline */}
      <div className={`z-10 mb-6 flex w-[min(860px,92vw)] items-center gap-6 rounded-xl bg-si-panel px-6 pb-3 pt-3 transition-opacity ${split ? "pointer-events-none opacity-40" : ""}`}>
        <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-si-green">
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <div className="flex-1">
          <input type="range" min={0} max={1000} value={Math.round(t * 1000)}
            onChange={(e) => { setPlaying(false); setT(Number(e.target.value) / 1000); }}
            aria-label="Treatment progress"
            className="si-range w-full"
            style={{ ["--p" as any]: `${t * 100}%` }} />
          <div className="mt-1 flex justify-between text-[13px] text-foreground">
            <span>Current smile</span><span>New smile</span>
          </div>
        </div>
      </div>
    </div>
  );
}
