import { useEffect, useState } from "react";

export type Route = "wall" | "scraps";

const ROUTES: Record<string, Route> = { "": "wall", wall: "wall", scraps: "scraps" };

export const readRoute = (): Route => ROUTES[location.hash.replace(/^#\/?/, "").toLowerCase()] ?? "wall";

export const href = (route: Route) => (route === "wall" ? "#/" : `#/${route}`);

export function useRoute(): Route {
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const update = () => setRoute(readRoute());
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    document.title = route === "scraps" ? "Scraps · Stickywall" : "Stickywall";
  }, [route]);

  return route;
}
