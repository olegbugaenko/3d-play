// GridStoreDynamicStatics.ts
export type Vec2 = { x: number; y: number };

export type StaticShape =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "aabb"; x0: number; y0: number; x1: number; y1: number };
