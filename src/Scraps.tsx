import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Nav from "./Nav";
import {
  clearScraps,
  deleteScrap,
  imageScrap,
  listScraps,
  putScrap,
  textScrap,
  type Scrap,
} from "./scraps";

const newestFirst = (a: Scrap, b: Scrap) => b.createdAt - a.createdAt;

const reason = (error: unknown) =>
  error instanceof Error && error.message ? error.message : "Something went wrong.";

const columnsFor = (width: number) => (width < 620 ? 1 : width < 980 ? 2 : width < 1360 ? 3 : 4);

function useColumnCount() {
  const [count, setCount] = useState(() => columnsFor(innerWidth));
  useEffect(() => {
    const update = () => setCount(columnsFor(innerWidth));
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  return count;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
];

function ago(time: number) {
  let value = (time - Date.now()) / 1000;
  for (const [unit, span] of STEPS) {
    if (Math.abs(value) < span) return relative.format(Math.round(value), unit);
    value /= span;
  }
  return relative.format(Math.round(value), "year");
}

const linkOf = (text: string) => {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
};

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

type Toast = { message: string; undo?: () => void };

export default function Scraps() {
  const [scraps, setScraps] = useState<Scrap[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [zoomed, setZoomed] = useState<Scrap | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [dropping, setDropping] = useState(false);

  const columnCount = useColumnCount();
  const composer = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const urls = useRef(new Map<string, string>());
  const dragDepth = useRef(0);
  const toastTimer = useRef(0);

  const urlFor = (scrap: Scrap) => {
    if (scrap.kind !== "image") return "";
    let url = urls.current.get(scrap.id);
    if (!url) {
      url = URL.createObjectURL(scrap.blob);
      urls.current.set(scrap.id, url);
    }
    return url;
  };

  const release = (id: string) => {
    const url = urls.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(id);
    }
  };

  useEffect(() => {
    const cache = urls.current;
    return () => {
      cache.forEach(URL.revokeObjectURL);
      cache.clear();
    };
  }, []);

  const notify = useCallback((message: string, undo?: () => void) => {
    setToast({ message, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 7000 : 2600);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let live = true;
    listScraps()
      .then((saved) => live && setScraps(saved))
      .catch((error) => live && setFatal(reason(error)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const add = useCallback(
    async (incoming: Scrap[]) => {
      if (!incoming.length) return;
      try {
        for (const scrap of incoming) await putScrap(scrap);
        setScraps((current) => [...incoming, ...current].sort(newestFirst));
      } catch (error) {
        notify(`Couldn't save: ${reason(error)}`);
      }
    },
    [notify],
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      const made: Scrap[] = [];
      for (const file of images) {
        try {
          made.push(await imageScrap(file));
        } catch (error) {
          notify(reason(error));
        }
      }
      await add(made);
      const skipped = files.length - images.length;
      if (skipped) notify(`Skipped ${skipped} file${skipped > 1 ? "s" : ""} that ${skipped > 1 ? "aren't" : "isn't"} an image.`);
    },
    [add, notify],
  );

  const saveDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    composer.current?.focus();
    void add([textScrap(text)]);
  }, [add, draft]);

  const remove = useCallback(
    async (scrap: Scrap) => {
      setScraps((current) => current.filter((item) => item.id !== scrap.id));
      try {
        await deleteScrap(scrap.id);
      } catch (error) {
        notify(`Couldn't delete: ${reason(error)}`);
        setScraps((current) => [scrap, ...current].sort(newestFirst));
        return;
      }
      notify(scrap.kind === "image" ? "Image deleted." : "Note deleted.", () => {
        setToast(null);
        void add([scrap]);
      });
    },
    [add, notify],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;
      const files = [...data.items]
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (files.length) {
        event.preventDefault();
        void addFiles(files);
        return;
      }
      const target = event.target;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return;
      const text = data.getData("text/plain").trim();
      if (!text) return;
      event.preventDefault();
      void add([textScrap(text)]);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [add, addFiles]);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setZoomed(null);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [zoomed]);

  const onDragEnter = (event: ReactDragEvent) => {
    if (![...event.dataTransfer.types].includes("Files")) return;
    dragDepth.current += 1;
    setDropping(true);
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDropping(false);
  };

  const onDrop = (event: ReactDragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    const files = [...event.dataTransfer.files];
    if (files.length) {
      void addFiles(files);
      return;
    }
    const text = event.dataTransfer.getData("text/plain").trim();
    if (text) void add([textScrap(text)]);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles([...(event.target.files ?? [])]);
    event.target.value = "";
  };

  const copy = async (scrap: Scrap) => {
    try {
      if (scrap.kind === "text") {
        await navigator.clipboard.writeText(scrap.text);
      } else {
        await navigator.clipboard.write([new ClipboardItem({ [scrap.blob.type]: scrap.blob })]);
      }
      notify("Copied.");
    } catch {
      notify("Your browser blocked the copy.");
    }
  };

  const download = (scrap: Scrap) => {
    if (scrap.kind !== "image") return;
    const anchor = document.createElement("a");
    anchor.href = urlFor(scrap);
    anchor.download = scrap.name.includes(".") ? scrap.name : `${scrap.name}.${(scrap.type.split("/")[1] ?? "png")}`;
    anchor.click();
  };

  const wipe = async () => {
    if (!confirm(`Delete all ${scraps.length} scraps? This can't be undone.`)) return;
    try {
      await clearScraps();
      scraps.forEach((scrap) => release(scrap.id));
      setScraps([]);
    } catch (error) {
      notify(`Couldn't clear: ${reason(error)}`);
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return scraps;
    return scraps.filter((scrap) =>
      (scrap.kind === "text" ? scrap.text : scrap.name).toLowerCase().includes(needle),
    );
  }, [query, scraps]);

  const columns = useMemo(() => {
    const buckets: Scrap[][] = Array.from({ length: columnCount }, () => []);
    visible.forEach((scrap, index) => buckets[index % columnCount].push(scrap));
    return buckets;
  }, [columnCount, visible]);

  const onComposerKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      saveDraft();
    }
    if (event.key === "Escape") event.currentTarget.blur();
  };

  return (
    <div
      className="scraps"
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="scraps-bar">
        <Nav current="scraps" />
        <div className="scraps-tools">
          <input
            className="search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search scraps"
            aria-label="Search scraps"
          />
          <button className="ghost" onClick={() => picker.current?.click()}>Add image</button>
          {scraps.length > 0 && (
            <button className="ghost danger" onClick={() => void wipe()}>Clear all</button>
          )}
        </div>
        <input
          ref={picker}
          className="visually-hidden"
          type="file"
          accept="image/*"
          multiple
          onChange={onPick}
        />
      </header>

      <div className="scraps-body">
        <div className="composer">
          <textarea
            ref={composer}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Paste or type a short note…"
            aria-label="New scrap"
            rows={draft.includes("\n") || draft.length > 70 ? 4 : 2}
          />
          <div className="composer-row">
            <span className="composer-hint">
              Paste anywhere to drop in text or a screenshot · drag files in
            </span>
            <button className="primary" onClick={saveDraft} disabled={!draft.trim()}>
              Save note
            </button>
          </div>
        </div>

        {fatal && <p className="notice error" role="alert">{fatal}</p>}

        {!fatal && !loading && scraps.length === 0 && (
          <div className="notice">
            <p>Nothing pinned up yet.</p>
            <span>Copy something and press {navigator.platform.includes("Mac") ? "⌘V" : "Ctrl+V"} — text, a link, or an image.</span>
          </div>
        )}

        {!fatal && scraps.length > 0 && visible.length === 0 && (
          <p className="notice">No scrap matches “{query.trim()}”.</p>
        )}

        <div className="masonry" style={{ "--columns": columnCount } as CSSProperties}>
          {columns.map((bucket, index) => (
            <div className="masonry-column" key={index}>
              {bucket.map((scrap) => {
                const link = scrap.kind === "text" ? linkOf(scrap.text) : null;
                return (
                  <article className={`scrap is-${scrap.kind}`} key={scrap.id}>
                    {scrap.kind === "image" ? (
                      <button
                        className="scrap-image"
                        onClick={() => setZoomed(scrap)}
                        title="Open image"
                        style={
                          scrap.width && scrap.height
                            ? ({ aspectRatio: `${scrap.width} / ${scrap.height}` } as CSSProperties)
                            : undefined
                        }
                      >
                        <img src={urlFor(scrap)} alt={scrap.name} loading="lazy" draggable={false} />
                      </button>
                    ) : link ? (
                      <a className="scrap-link" href={link.href} target="_blank" rel="noreferrer noopener">
                        <span className="scrap-link-host">{link.hostname.replace(/^www\./, "")}</span>
                        <span className="scrap-link-path">{link.pathname === "/" ? link.href : link.pathname + link.search}</span>
                      </a>
                    ) : (
                      <p className="scrap-text">{scrap.text}</p>
                    )}

                    <footer className="scrap-meta">
                      <time dateTime={new Date(scrap.createdAt).toISOString()} title={new Date(scrap.createdAt).toLocaleString()}>
                        {ago(scrap.createdAt)}
                        {scrap.kind === "image" && ` · ${sizeOf(scrap.blob.size)}`}
                      </time>
                      <span className="scrap-actions">
                        <button onClick={() => void copy(scrap)} title="Copy" aria-label="Copy scrap">Copy</button>
                        {scrap.kind === "image" && (
                          <button onClick={() => download(scrap)} title="Download" aria-label="Download image">Save</button>
                        )}
                        <button
                          className="danger"
                          onClick={() => {
                            release(scrap.id);
                            void remove(scrap);
                          }}
                          title="Delete"
                          aria-label="Delete scrap"
                        >
                          Delete
                        </button>
                      </span>
                    </footer>
                  </article>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {dropping && <div className="drop-veil" aria-hidden="true"><span>Drop to pin it up</span></div>}

      {zoomed?.kind === "image" && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={zoomed.name} onClick={() => setZoomed(null)}>
          <img src={urlFor(zoomed)} alt={zoomed.name} onClick={(event) => event.stopPropagation()} />
          <button className="lightbox-close" onClick={() => setZoomed(null)} aria-label="Close image">×</button>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && <button onClick={toast.undo}>Undo</button>}
        </div>
      )}
    </div>
  );
}
