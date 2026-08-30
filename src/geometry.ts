export type Point = { x: number; y: number };
export type Viewport = Point & { zoom: number };

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const screenToWorld = (view: Viewport, point: Point): Point => ({
  x: (point.x - view.x) / view.zoom,
  y: (point.y - view.y) / view.zoom,
});

export const zoomAt = (view: Viewport, point: Point, zoom: number): Viewport => {
  const world = screenToWorld(view, point);
  return { x: point.x - world.x * zoom, y: point.y - world.y * zoom, zoom };
};
