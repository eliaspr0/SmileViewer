# Smile Viewer

A browser-based 3D viewer for comparing a patient's **Starter Smile** and **Final Smile** clear aligner scans (STL files) side by side. Files never leave the browser — nothing is uploaded to a server.

## Using the viewer

1. **Open the app.** It starts in **Before & After** mode with two drop areas: left for the Starter Smile, right for the Final Smile.
2. **Load scans.** Drag and drop STL files onto each area (or click to browse). You can drop several files per side, e.g. upper and lower jaw. Each drop area disappears once its scan loads. Use **Open scans** (top right) to load different files.
   - Tip: include `upper`/`maxillary` or `lower`/`mandibular` in file names so the jaw views pick the right jaw.
3. **Move the models** (both sides move together):
   - **Right-click + drag** — rotate
   - **Scroll-wheel click + drag** — pan
   - **Scroll wheel** — zoom
4. **Preset views** (toolbar on the left): Front, Top (upper jaw from the biting side), Bottom (lower jaw from the biting side), Left, Right.
5. **Overlay mode.** Toggle **Before & After** off to show one model with a play bar:
   - **Play** blends Starter → Final Smile once; turn on **Loop** to repeat.
   - Drag the slider, or click **Starter Smile** / **Final Smile** to jump to either state.

## Development

Requires Node.js 18+ (or Bun).

```sh
npm install
npm run dev
```

Then open http://localhost:8080.

## Built with

TanStack Start, React, TypeScript, Three.js, Tailwind CSS.
