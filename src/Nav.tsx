import { href, type Route } from "./router";

const LABELS: Record<Route, string> = { wall: "Wall", scraps: "Scraps" };

export default function Nav({ current }: { current: Route }) {
  return (
    <nav className="nav" aria-label="Pages">
      {(Object.keys(LABELS) as Route[]).map((route) => (
        <a
          key={route}
          href={href(route)}
          className={route === current ? "is-current" : undefined}
          aria-current={route === current ? "page" : undefined}
        >
          {LABELS[route]}
        </a>
      ))}
    </nav>
  );
}
