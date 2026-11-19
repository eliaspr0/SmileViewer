# Smile Viewer

Compare a patient's **Starter Smile** and **Final Smile** clear aligner scans in 3D, right in your browser.

🔗 **Live demo:** https://smileviewer.eliasprountzos.workers.dev/

> 🔒 **Private by design:** your STL files never leave your computer. Nothing is uploaded to a server.

---

## How to use it

1. **Open the app.** You'll see two drop areas: Starter Smile (left) and Final Smile (right).
2. **Add your scans.** Drag and drop STL files onto each side, or click to browse. You can add several files per side (for example, upper and lower jaw).
   - 💡 Put `upper` / `maxillary` or `lower` / `mandibular` in the file name so the jaw views pick the right jaw.
3. **Look around.** Both sides move together:

   | Action | Control |
   | --- | --- |
   | Rotate | Right-click + drag |
   | Pan | Scroll-wheel click + drag |
   | Zoom | Scroll wheel |

4. **Use the preset views** in the left toolbar: Front, Top, Bottom, Left, Right.
5. **Load different scans** any time with **Open scans** (top right).

### Overlay mode

Turn off **Before & After** to see one model that morphs between the two scans:

- **Play** blends Starter Smile → Final Smile. Turn on **Loop** to repeat.
- **Drag the slider** to stop anywhere in between.
- Click **Starter Smile** or **Final Smile** to jump straight to either one.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer (or [Bun](https://bun.sh)).

```sh
npm install
npm run dev
```

Then open http://localhost:8080.

### Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Create a production build |
| `npm run preview` | Preview the production build |
| `npm test` | Run the tests |
| `npm run lint` | Check the code style |

---

## Built with

TanStack Start · React · TypeScript · Three.js · Tailwind CSS
