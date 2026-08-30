import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { clamp, screenToWorld, zoomAt, type Point, type Viewport } from "./geometry";

const STORAGE_KEY = "stickywall.board.v1";
const NOTE_SIZE = 240;
const WORLD_LIMIT = 1_000_000;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

type Note = Point & {
  id: string;
  text: string;
  tilt: number;
  z: number;
};

type Board = { notes: Note[]; viewport: Viewport };

const freshViewport = (): Viewport => ({
  x: innerWidth / 2,
  y: innerHeight / 2,
  zoom: 1,
});

const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;

function loadBoard(): Board {
  const empty = { notes: [], viewport: freshViewport() };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!saved || !Array.isArray(saved.notes)) return empty;

    const notes = saved.notes.flatMap((note: Partial<Note>) =>
      typeof note.id === "string" && typeof note.text === "string"
        ? [{
            id: note.id,
            text: note.text,
            x: finite(note.x, 0, -WORLD_LIMIT, WORLD_LIMIT),
            y: finite(note.y, 0, -WORLD_LIMIT, WORLD_LIMIT),
            tilt: finite(note.tilt, 0, -2, 2),
            z: finite(note.z, 1, 1, 1_000_000),
          }]
        : [],
    );
    const view = saved.viewport ?? {};
    return {
      notes,
      viewport: {
        x: finite(view.x, empty.viewport.x, -WORLD_LIMIT * 3, WORLD_LIMIT * 3),
        y: finite(view.y, empty.viewport.y, -WORLD_LIMIT * 3, WORLD_LIMIT * 3),
        zoom: finite(view.zoom, 1, MIN_ZOOM, MAX_ZOOM),
      },
    };
  } catch {
    return empty;
  }
}

function StickyNote({
  note,
  zoom,
  focus,
  onChange,
  onDelete,
  onFocus,
  onMove,
}: {
  note: Note;
  zoom: number;
  focus: boolean;
  onChange: (text: string) => void;
  onDelete: () => void;
  onFocus: () => void;
  onMove: (point: Point) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (focus) requestAnimationFrame(() => textarea.current?.focus());
  }, [focus]);

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: note.x, y: note.y },
    };
    setDragging(true);
    onFocus();
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    onMove({
      x: clamp(drag.current.origin.x + (event.clientX - drag.current.start.x) / zoom, -WORLD_LIMIT, WORLD_LIMIT),
      y: clamp(drag.current.origin.y + (event.clientY - drag.current.start.y) / zoom, -WORLD_LIMIT, WORLD_LIMIT),
    });
  };

  const stopDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  return (
    <article
      className={`note${dragging ? " is-dragging" : ""}`}
      style={{ left: note.x, top: note.y, zIndex: note.z, transform: `rotate(${note.tilt}deg)` }}
      onPointerDown={startDrag}
      onPointerMove={move}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onFocusCapture={onFocus}
      aria-label="Sticky note"
    >
      <div className="note-grip" aria-hidden="true" />
      <button className="delete-note" onClick={onDelete} aria-label="Delete note" title="Delete note">×</button>
      <textarea
        ref={textarea}
        value={note.text}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
          event.stopPropagation();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Write something…"
        aria-label="Note text"
        spellCheck
      />
    </article>
  );
}

export default function App() {
  const [board, setBoard] = useState(loadBoard);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const boardRef = useRef<HTMLElement>(null);
  const latest = useRef(board);
  const pan = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  latest.current = board;

  const save = (value: Board) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => save(board), 250);
    return () => clearTimeout(timer);
  }, [board]);

  useEffect(() => {
    const flush = () => save(latest.current);
    const hide = () => document.visibilityState === "hidden" && flush();
    addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      flush();
      removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      setBoard((current) => {
        const zoom = clamp(current.viewport.zoom * Math.exp(-event.deltaY * multiplier * 0.0012), MIN_ZOOM, MAX_ZOOM);
        return { ...current, viewport: zoomAt(current.viewport, point, zoom) };
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  const addNote = (screenPoint?: Point) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = screenPoint ?? { x: rect.width / 2, y: rect.height / 2 };
    const id = crypto.randomUUID();
    setBoard((current) => {
      const world = screenToWorld(current.viewport, point);
      const count = current.notes.length;
      return {
        ...current,
        notes: [...current.notes, {
          id,
          text: "",
          x: clamp(world.x - NOTE_SIZE / 2 + (count % 5) * 8, -WORLD_LIMIT, WORLD_LIMIT),
          y: clamp(world.y - NOTE_SIZE / 2 + (count % 5) * 8, -WORLD_LIMIT, WORLD_LIMIT),
          tilt: ((count * 37) % 9 - 4) / 3,
          z: Math.max(0, ...current.notes.map((note) => note.z)) + 1,
        }],
      };
    });
    setFocusId(id);
  };

  const bringForward = (id: string) => {
    setBoard((current) => {
      const note = current.notes.find((item) => item.id === id);
      const top = Math.max(0, ...current.notes.map((item) => item.z));
      if (!note || note.z === top) return current;
      return { ...current, notes: current.notes.map((item) => item.id === id ? { ...item, z: top + 1 } : item) };
    });
  };

  const startPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || (event.button !== 0 && event.button !== 1)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = {
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: board.viewport.x, y: board.viewport.y },
    };
    setPanning(true);
  };

  const movePan = (event: ReactPointerEvent<HTMLElement>) => {
    if (!pan.current || pan.current.pointerId !== event.pointerId) return;
    const { start, origin } = pan.current;
    setBoard((current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        x: clamp(origin.x + event.clientX - start.x, -WORLD_LIMIT * 3, WORLD_LIMIT * 3),
        y: clamp(origin.y + event.clientY - start.y, -WORLD_LIMIT * 3, WORLD_LIMIT * 3),
      },
    }));
  };

  const stopPan = (event: ReactPointerEvent<HTMLElement>) => {
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
  };

  const { notes, viewport } = board;
  const dot = 24 * viewport.zoom;

  return (
    <main
      ref={boardRef}
      className={`board${panning ? " is-panning" : ""}`}
      style={{
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        backgroundSize: `${dot}px ${dot}px`,
      }}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
      onDoubleClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        addNote({ x: event.clientX - rect.left, y: event.clientY - rect.top });
      }}
      aria-label="Sticky note canvas"
    >
      <div
        className="world"
        style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})` }}
      >
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            note={note}
            zoom={viewport.zoom}
            focus={focusId === note.id}
            onFocus={() => bringForward(note.id)}
            onChange={(text) => setBoard((current) => ({
              ...current,
              notes: current.notes.map((item) => item.id === note.id ? { ...item, text } : item),
            }))}
            onMove={(point) => setBoard((current) => ({
              ...current,
              notes: current.notes.map((item) => item.id === note.id ? { ...item, ...point } : item),
            }))}
            onDelete={() => {
              setBoard((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== note.id) }));
              setFocusId(null);
            }}
          />
        ))}
      </div>

      <div className="controls">
        <button className="add-note" onClick={() => addNote()}><span aria-hidden="true">+</span> Add note</button>
        <button
          className="reset-view"
          onClick={() => setBoard((current) => ({ ...current, viewport: freshViewport() }))}
        >
          Reset view
        </button>
      </div>

      {notes.length === 0 && (
        <div className="empty-state" aria-hidden="true">
          <p>Your wall is quiet.</p>
          <span>Add a note or double-click anywhere.</span>
        </div>
      )}
      <div className="hint" aria-hidden="true">Drag to move · Scroll to zoom</div>
      {saveFailed && <div className="save-error" role="alert">Couldn’t save locally.</div>}
    </main>
  );
}
