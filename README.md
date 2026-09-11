# Stickywall

A minimal, local-first wall for the things you want to keep in sight. Everything stays in your browser and remains available offline.

Two pages, switched from the toggle in the corner:

- **Wall** — an infinite canvas of sticky notes. Drag to pan, scroll to zoom, double-click to add. Notes, positions, and the viewport persist in `localStorage`.
- **Scraps** — a paste board for short notes, links, and images. Paste anywhere on the page (⌘V / Ctrl+V) to drop in text or a screenshot, drag image files in, or type a note in the composer. Scraps are stored in IndexedDB so screenshots don't run into the `localStorage` quota.

```bash
npm install
npm run dev
```

`npm run build` type-checks and bundles; `npm test` runs the viewport geometry checks. Pushing to `main` deploys to GitHub Pages.
