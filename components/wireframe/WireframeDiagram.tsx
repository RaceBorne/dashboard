'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  Minus,
  Maximize2,
  ExternalLink,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Send,
  Info,
  LayoutGrid,
} from 'lucide-react';
import {
  WIREFRAME_NODES,
  WIREFRAME_FLOWS,
  totalMonthlyGBP,
  TIER_META,
  DASHBOARD_MAP,
  CLUSTERS,
  VIEW_W,
  VIEW_H,
  BOX_W,
  BOX_H,
  CLUSTER_PAD,
  CLUSTER_TITLE_H,
  CANVAS_MARGIN,
  computeDefaultPositions,
  type WireframeNode,
  type WireframeFlow,
} from '@/lib/wireframe';
import { cn, formatGBP } from '@/lib/utils';

interface Props {
  /** Set of env var names that are present (computed server-side at page load) */
  envPresent: Set<string>;
  /** Non-secret identifier values (e.g. SHOPIFY_STORE_DOMAIN, GMAIL_USER_EMAIL) */
  identifierValues: Record<string, string>;
}

// Zoom clamps
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.15;

type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'flow'; from: string; to: string }
  | null;

interface View {
  zoom: number;
  /** Pan offset in viewport pixels (pre-scale) */
  panX: number;
  panY: number;
}

const IDENTITY: View = { zoom: 1, panX: 0, panY: 0 };

/** Snap grid in viewBox units — drag-end positions land on multiples of this.
 *  Matches the 16-unit gap used in computeDefaultPositions so snapping
 *  preserves consistent spacing between boxes. */
const SNAP_GRID = 16;
const snap = (v: number) => Math.round(v / SNAP_GRID) * SNAP_GRID;

/**
 * Build an SVG path that goes from box A's centre to box B's centre using
 * only horizontal and vertical segments, with rounded corners of radius `r`.
 * The path attaches to the side of each box that the line approaches from
 * — left/right for horizontal-dominant flows, top/bottom for vertical.
 *
 * Returns the path string AND the actual start/end attach points so the
 * caller can render endpoint circles.
 */
function orthogonalPath(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number = 16,
): { d: string; sx: number; sy: number; ex: number; ey: number } {
  const hw = BOX_W / 2;
  const hh = BOX_H / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const horizDominant = Math.abs(dx) >= Math.abs(dy);

  let sx: number, sy: number, ex: number, ey: number;
  if (horizDominant) {
    sx = ax + Math.sign(dx) * hw;
    sy = ay;
    ex = bx - Math.sign(dx) * hw;
    ey = by;
  } else {
    sx = ax;
    sy = ay + Math.sign(dy) * hh;
    ex = bx;
    ey = by - Math.sign(dy) * hh;
  }

  // Degenerate cases: aligned on the perpendicular axis → straight line
  if (horizDominant && Math.abs(ey - sy) < 0.5) {
    return { d: `M ${sx} ${sy} L ${ex} ${ey}`, sx, sy, ex, ey };
  }
  if (!horizDominant && Math.abs(ex - sx) < 0.5) {
    return { d: `M ${sx} ${sy} L ${ex} ${ey}`, sx, sy, ex, ey };
  }

  if (horizDominant) {
    // Z-shape: H → V → H
    const mx = (sx + ex) / 2;
    const dxA = Math.sign(mx - sx);
    const dyM = Math.sign(ey - sy);
    const dxB = Math.sign(ex - mx);
    const segH1 = Math.abs(mx - sx);
    const segH2 = Math.abs(ex - mx);
    const segV = Math.abs(ey - sy);
    const rEff = Math.max(0, Math.min(r, segH1, segH2, segV / 2));
    return {
      d: [
        `M ${sx} ${sy}`,
        `L ${mx - dxA * rEff} ${sy}`,
        `Q ${mx} ${sy} ${mx} ${sy + dyM * rEff}`,
        `L ${mx} ${ey - dyM * rEff}`,
        `Q ${mx} ${ey} ${mx + dxB * rEff} ${ey}`,
        `L ${ex} ${ey}`,
      ].join(' '),
      sx,
      sy,
      ex,
      ey,
    };
  } else {
    // S-shape: V → H → V
    const my = (sy + ey) / 2;
    const dyA = Math.sign(my - sy);
    const dxM = Math.sign(ex - sx);
    const dyB = Math.sign(ey - my);
    const segV1 = Math.abs(my - sy);
    const segV2 = Math.abs(ey - my);
    const segH = Math.abs(ex - sx);
    const rEff = Math.max(0, Math.min(r, segV1, segV2, segH / 2));
    return {
      d: [
        `M ${sx} ${sy}`,
        `L ${sx} ${my - dyA * rEff}`,
        `Q ${sx} ${my} ${sx + dxM * rEff} ${my}`,
        `L ${ex - dxM * rEff} ${my}`,
        `Q ${ex} ${my} ${ex} ${my + dyB * rEff}`,
        `L ${ex} ${ey}`,
      ].join(' '),
      sx,
      sy,
      ex,
      ey,
    };
  }
}

/** Check whether an axis-aligned segment (x1,y1)-(x2,y2) passes through a
 *  box centred at (bx, by), including a 16-unit buffer around it. */
function segmentCrossesBox(
  x1: number, y1: number, x2: number, y2: number,
  bx: number, by: number,
): boolean {
  const minX = bx - BOX_W / 2 - 16;
  const maxX = bx + BOX_W / 2 + 16;
  const minY = by - BOX_H / 2 - 16;
  const maxY = by + BOX_H / 2 + 16;
  if (Math.abs(x1 - x2) < 0.5) {
    // Vertical segment at x=x1
    if (x1 <= minX || x1 >= maxX) return false;
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    return hi > minY && lo < maxY;
  }
  if (Math.abs(y1 - y2) < 0.5) {
    // Horizontal segment at y=y1
    if (y1 <= minY || y1 >= maxY) return false;
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    return hi > minX && lo < maxX;
  }
  return false;
}

/** Segments encoded as [x1, y1, x2, y2]. */
type Segment = [number, number, number, number];

function routeClear(
  segments: Segment[],
  excludeIds: string[],
  positions: Map<string, { x: number; y: number }>,
): boolean {
  for (const [x1, y1, x2, y2] of segments) {
    for (const [id, p] of positions) {
      if (excludeIds.includes(id)) continue;
      if (segmentCrossesBox(x1, y1, x2, y2, p.x, p.y)) return false;
    }
  }
  return true;
}

/** Score a route — lower = better. Penalises blockages heavily. */
function routeScore(
  segments: Segment[],
  excludeIds: string[],
  positions: Map<string, { x: number; y: number }>,
): number {
  let blocks = 0;
  for (const [x1, y1, x2, y2] of segments) {
    for (const [id, p] of positions) {
      if (excludeIds.includes(id)) continue;
      if (segmentCrossesBox(x1, y1, x2, y2, p.x, p.y)) blocks++;
    }
  }
  // Total path length (Manhattan) as tiebreaker
  let len = 0;
  for (const [x1, y1, x2, y2] of segments) {
    len += Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  return blocks * 100000 + len;
}

/** Build Z-shape (H-V-H) segments at a given mid-x. Exit/entry side of each
 *  box is determined by mid-x's position relative to that box. This handles
 *  degenerate cases (same-axis) cleanly. */
function zSegments(ax: number, ay: number, bx: number, by: number, mx: number): {
  segments: Segment[];
  sx: number; sy: number; ex: number; ey: number;
} {
  const hw = BOX_W / 2;
  const sx = ax + Math.sign(mx - ax) * hw;
  const sy = ay;
  const ex = bx + Math.sign(mx - bx) * hw;
  const ey = by;
  return {
    segments: [
      [sx, sy, mx, sy],
      [mx, sy, mx, ey],
      [mx, ey, ex, ey],
    ],
    sx, sy, ex, ey,
  };
}

/** Build S-shape (V-H-V) segments at a given mid-y. Exit/entry side of each
 *  box is determined by mid-y's position relative to that box. */
function sSegments(ax: number, ay: number, bx: number, by: number, my: number): {
  segments: Segment[];
  sx: number; sy: number; ex: number; ey: number;
} {
  const hh = BOX_H / 2;
  const sx = ax;
  const sy = ay + Math.sign(my - ay) * hh;
  const ex = bx;
  const ey = by + Math.sign(my - by) * hh;
  return {
    segments: [
      [sx, sy, sx, my],
      [sx, my, ex, my],
      [ex, my, ex, ey],
    ],
    sx, sy, ex, ey,
  };
}

/** Render segments as an SVG path with rounded corners. */
function renderSegmentsAsPath(
  segs: Segment[],
  sx: number, sy: number, ex: number, ey: number,
  r: number,
): string {
  if (segs.length === 0) return `M ${sx} ${sy} L ${ex} ${ey}`;
  // segs should be 3 segments for Z or S shapes; straight for single-segment.
  if (segs.length === 1) {
    return `M ${sx} ${sy} L ${ex} ${ey}`;
  }
  // Generic N-segment render: for each internal corner, apply a Q curve.
  const pts: [number, number][] = [];
  pts.push([segs[0][0], segs[0][1]]);
  for (const [x1, y1, x2, y2] of segs) pts.push([x2, y2]);
  // pts now has corner points including start/end.
  // Build path: start, then for each middle point, approach with L, turn with Q.
  if (pts.length === 2) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`;
  const parts: string[] = [`M ${pts[0][0]} ${pts[0][1]}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    // Compute the unit vectors
    const toCurrDx = Math.sign(curr[0] - prev[0]);
    const toCurrDy = Math.sign(curr[1] - prev[1]);
    const fromCurrDx = Math.sign(next[0] - curr[0]);
    const fromCurrDy = Math.sign(next[1] - curr[1]);
    const segInLen = Math.abs(curr[0] - prev[0]) + Math.abs(curr[1] - prev[1]);
    const segOutLen = Math.abs(next[0] - curr[0]) + Math.abs(next[1] - curr[1]);
    const rEff = Math.max(0, Math.min(r, segInLen / 2, segOutLen / 2));
    parts.push(`L ${curr[0] - toCurrDx * rEff} ${curr[1] - toCurrDy * rEff}`);
    parts.push(`Q ${curr[0]} ${curr[1]} ${curr[0] + fromCurrDx * rEff} ${curr[1] + fromCurrDy * rEff}`);
  }
  const last = pts[pts.length - 1];
  parts.push(`L ${last[0]} ${last[1]}`);
  return parts.join(' ');
}

// --- A* over 16-unit grid ----------------------------------------------

// Coarser 32-unit grid for routing — gives calmer, less-jittery paths and
// cuts A* work 4× vs the 16-unit drag-snap grid. Cells are deliberately larger
// than the 16-unit box-gap so lines can't thread between adjacent boxes.
const CELL = 32;
const GRID_COLS = Math.ceil(VIEW_W / CELL);
const GRID_ROWS = Math.ceil(VIEW_H / CELL);
type CellIdx = number; // packed col + row * GRID_COLS

/** Tiny binary min-heap keyed by f-score. Fast O(log N) pop/push. */
class MinHeap {
  items: number[] = []; // CellIdx
  scores: number[] = [];
  push(item: number, score: number) {
    this.items.push(item);
    this.scores.push(score);
    this.up(this.items.length - 1);
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      this.down(0);
    }
    return top;
  }
  get size() { return this.items.length; }
  private up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.scores[p] <= this.scores[i]) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      [this.scores[p], this.scores[i]] = [this.scores[i], this.scores[p]];
      i = p;
    }
  }
  private down(i: number) {
    const n = this.items.length;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let m = i;
      if (l < n && this.scores[l] < this.scores[m]) m = l;
      if (r < n && this.scores[r] < this.scores[m]) m = r;
      if (m === i) break;
      [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
      [this.scores[m], this.scores[i]] = [this.scores[i], this.scores[m]];
      i = m;
    }
  }
}

/** Build a Set of blocked cell indexes from box positions. Each box marks
 *  every cell within its bbox + 16 buffer as blocked. */
function buildBlocked(
  positions: Map<string, { x: number; y: number }>,
  excludeIds: string[],
): Set<CellIdx> {
  const blocked = new Set<CellIdx>();
  positions.forEach((p, id) => {
    if (excludeIds.includes(id)) return;
    const minX = p.x - BOX_W / 2 - 16;
    const maxX = p.x + BOX_W / 2 + 16;
    const minY = p.y - BOX_H / 2 - 16;
    const maxY = p.y + BOX_H / 2 + 16;
    const c0 = Math.max(0, Math.floor(minX / CELL));
    const c1 = Math.min(GRID_COLS - 1, Math.floor(maxX / CELL));
    const r0 = Math.max(0, Math.floor(minY / CELL));
    const r1 = Math.min(GRID_ROWS - 1, Math.floor(maxY / CELL));
    for (let r = r0; r <= r1; r++) {
      const rowOffset = r * GRID_COLS;
      for (let c = c0; c <= c1; c++) {
        blocked.add(c + rowOffset);
      }
    }
  });
  return blocked;
}

function packCell(c: number, r: number): CellIdx {
  return c + r * GRID_COLS;
}
function unpackCell(idx: CellIdx): [number, number] {
  return [idx % GRID_COLS, Math.floor(idx / GRID_COLS)];
}
function cellCenter(idx: CellIdx): [number, number] {
  const [c, r] = unpackCell(idx);
  return [c * CELL + CELL / 2, r * CELL + CELL / 2];
}

/** A* on the 32-unit grid. Returns sequence of cell indexes from start to
 *  goal, or null if no path exists. The `usedCells` set is the union of every
 *  previously-routed line's path — moving onto a used cell costs much less
 *  (0.2 instead of 1) so subsequent routes prefer to overlap existing lines
 *  rather than running parallel. This produces "shared backbone" channels
 *  through the gaps between clusters.
 *
 *  Turn cost (+3) keeps paths mostly straight, but is small enough that a
 *  one- or two-corner detour to join an existing channel is preferred over
 *  running parallel within 32 units. */
function aStarGrid(
  startIdx: CellIdx,
  goalIdx: CellIdx,
  blocked: Set<CellIdx>,
  usedCells: Set<CellIdx>,
): CellIdx[] | null {
  if (blocked.has(startIdx) || blocked.has(goalIdx)) return null;
  const [gc, gr] = unpackCell(goalIdx);
  const heuristic = (idx: CellIdx) => {
    const [c, r] = unpackCell(idx);
    return Math.abs(c - gc) + Math.abs(r - gr);
  };
  const open = new MinHeap();
  const gScore = new Map<CellIdx, number>();
  const cameFrom = new Map<CellIdx, CellIdx>();
  const cameDir = new Map<CellIdx, number>(); // 0=horizontal, 1=vertical, -1=start
  gScore.set(startIdx, 0);
  cameDir.set(startIdx, -1);
  open.push(startIdx, heuristic(startIdx));
  let iters = 0;
  const MAX_ITERS = 6000;
  while (open.size > 0 && iters++ < MAX_ITERS) {
    const current = open.pop()!;
    if (current === goalIdx) {
      const path: CellIdx[] = [current];
      let c = current;
      while (cameFrom.has(c)) {
        c = cameFrom.get(c)!;
        path.unshift(c);
      }
      return path;
    }
    const [cc, cr] = unpackCell(current);
    const curG = gScore.get(current) ?? 0;
    const curDir = cameDir.get(current) ?? -1;
    const nbrs: Array<[number, number, number]> = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 1],
      [0, -1, 1],
    ];
    for (const [dc, dr, dir] of nbrs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      const nIdx = packCell(nc, nr);
      if (blocked.has(nIdx)) continue;
      // Step cost: near-free (0.04) if the cell is already used by a
      // previous route — this strongly pulls subsequent paths onto the
      // same channel instead of running 32 units parallel. Empty cells
      // cost the standard 1.
      const stepCost = usedCells.has(nIdx) ? 0.04 : 1;
      // Moderate turn cost — high enough to keep runs mostly straight,
      // low enough that a 1-2 corner detour to merge onto an existing
      // channel is cheaper than running parallel.
      const turnCost = curDir !== -1 && curDir !== dir ? 3 : 0;
      const tentativeG = curG + stepCost + turnCost;
      const known = gScore.get(nIdx);
      if (known === undefined || tentativeG < known) {
        gScore.set(nIdx, tentativeG);
        cameFrom.set(nIdx, current);
        cameDir.set(nIdx, dir);
        open.push(nIdx, tentativeG + heuristic(nIdx));
      }
    }
  }
  return null;
}

/** Convert an A* cell path into compressed corner points (only direction-
 *  change cells survive). */
function pathToCorners(path: CellIdx[]): Array<[number, number]> {
  if (path.length === 0) return [];
  if (path.length === 1) return [cellCenter(path[0])];
  const points: Array<[number, number]> = [cellCenter(path[0])];
  for (let i = 1; i < path.length - 1; i++) {
    const [pc, pr] = unpackCell(path[i - 1]);
    const [c, r] = unpackCell(path[i]);
    const [nc, nr] = unpackCell(path[i + 1]);
    const dxIn = Math.sign(c - pc);
    const dyIn = Math.sign(r - pr);
    const dxOut = Math.sign(nc - c);
    const dyOut = Math.sign(nr - r);
    if (dxIn !== dxOut || dyIn !== dyOut) {
      points.push(cellCenter(path[i]));
    }
  }
  points.push(cellCenter(path[path.length - 1]));
  return points;
}

/** Remove consecutive duplicate points and any midpoint that's collinear
 *  with its neighbours. Keeps the polyline minimal so the curve renderer
 *  doesn't try to bend at a non-corner. */
function dedupeCollinear(
  pts: Array<[number, number]>,
): Array<[number, number]> {
  if (pts.length <= 2) return pts.slice();
  const out: Array<[number, number]> = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1];
    const curr = pts[i];
    if (Math.abs(prev[0] - curr[0]) < 0.5 && Math.abs(prev[1] - curr[1]) < 0.5) {
      continue; // duplicate
    }
    if (out.length >= 2) {
      const prev2 = out[out.length - 2];
      const dx1 = Math.sign(prev[0] - prev2[0]);
      const dy1 = Math.sign(prev[1] - prev2[1]);
      const dx2 = Math.sign(curr[0] - prev[0]);
      const dy2 = Math.sign(curr[1] - prev[1]);
      if (dx1 === dx2 && dy1 === dy2) {
        // Same direction — `prev` is collinear, drop it.
        out.pop();
      }
    }
    out.push(curr);
  }
  return out;
}

/** Render an array of corner points as an SVG path string with rounded
 *  corners of radius `r`. */
function pointsToPath(points: Array<[number, number]>, r: number): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }
  const parts: string[] = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inDx = Math.sign(curr[0] - prev[0]);
    const inDy = Math.sign(curr[1] - prev[1]);
    const outDx = Math.sign(next[0] - curr[0]);
    const outDy = Math.sign(next[1] - curr[1]);
    const segInLen = Math.abs(curr[0] - prev[0]) + Math.abs(curr[1] - prev[1]);
    const segOutLen = Math.abs(next[0] - curr[0]) + Math.abs(next[1] - curr[1]);
    const rEff = Math.max(0, Math.min(r, segInLen / 2, segOutLen / 2));
    parts.push(`L ${curr[0] - inDx * rEff} ${curr[1] - inDy * rEff}`);
    parts.push(
      `Q ${curr[0]} ${curr[1]} ${curr[0] + outDx * rEff} ${curr[1] + outDy * rEff}`,
    );
  }
  const last = points[points.length - 1];
  parts.push(`L ${last[0]} ${last[1]}`);
  return parts.join(' ');
}

/** Pick exit/entry geometry for a box based on direction toward the other.
 *  Returns:
 *   - `idx`: the first clear grid cell outside the box buffer — where A* starts
 *   - `exitX/Y`: that cell's anchoring point, 16 units outside the box edge
 *   - `attachX/Y`: the point exactly on the box's edge where the line visually
 *     lands (the circle is drawn here; a perpendicular stub joins it to exitX/Y). */
function pickExitCell(
  src: { x: number; y: number },
  dst: { x: number; y: number },
  blocked: Set<CellIdx>,
): {
  idx: CellIdx;
  exitX: number; exitY: number;
  attachX: number; attachY: number;
} {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const horizDominant = Math.abs(dx) >= Math.abs(dy);
  let attachX: number, attachY: number, exitX: number, exitY: number;
  let cellCol: number, cellRow: number;
  let stepDx: number, stepDy: number;
  if (horizDominant) {
    const dir = Math.sign(dx) || 1;
    attachX = src.x + dir * (BOX_W / 2);
    attachY = src.y;
    // The box's blocked region extends out to (BOX_W/2 + 16). buildBlocked
    // marks every cell that touches that region as blocked, so the cell
    // *containing* the buffer edge is itself blocked. Step one cell PAST
    // that to land on the first guaranteed-unblocked anchor.
    const bufferedEdge = src.x + dir * (BOX_W / 2 + 16);
    cellCol = dir > 0
      ? Math.floor(bufferedEdge / CELL) + 1
      : Math.floor(bufferedEdge / CELL) - 1;
    cellRow = Math.floor(attachY / CELL);
    stepDx = dir;
    stepDy = 0;
  } else {
    const dir = Math.sign(dy) || 1;
    attachX = src.x;
    attachY = src.y + dir * (BOX_H / 2);
    const bufferedEdge = src.y + dir * (BOX_H / 2 + 16);
    cellRow = dir > 0
      ? Math.floor(bufferedEdge / CELL) + 1
      : Math.floor(bufferedEdge / CELL) - 1;
    cellCol = Math.floor(attachX / CELL);
    stepDx = 0;
    stepDy = dir;
  }
  // If the proposed exit cell is itself blocked (some OTHER box is sitting
  // in the way) walk further out along the attach axis until we hit one
  // that's clear. Without this A* would refuse to even start and the
  // fallback Z/S router would draw the line — usually with weird elbows.
  let safety = 0;
  while (safety++ < 32) {
    const c = Math.max(0, Math.min(GRID_COLS - 1, cellCol));
    const r = Math.max(0, Math.min(GRID_ROWS - 1, cellRow));
    if (!blocked.has(packCell(c, r))) {
      cellCol = c;
      cellRow = r;
      break;
    }
    cellCol += stepDx;
    cellRow += stepDy;
    if (cellCol < 0 || cellCol >= GRID_COLS || cellRow < 0 || cellRow >= GRID_ROWS) break;
  }
  cellCol = Math.max(0, Math.min(GRID_COLS - 1, cellCol));
  cellRow = Math.max(0, Math.min(GRID_ROWS - 1, cellRow));
  exitX = horizDominant ? cellCol * CELL + CELL / 2 : attachX;
  exitY = horizDominant ? attachY : cellRow * CELL + CELL / 2;
  return {
    idx: packCell(cellCol, cellRow),
    exitX,
    exitY,
    attachX,
    attachY,
  };
}

/**
 * Pick the best path among several candidates. Tries Z-shape, S-shape, and
 * Z/S with mid-line shifted in 16-unit increments to either side. Returns the
 * lowest-scoring (fewest blockages + shortest) route.
 */
function smartRoute(
  ax: number, ay: number, bx: number, by: number,
  excludeIds: string[],
  positions: Map<string, { x: number; y: number }>,
  usedCells: Set<CellIdx>,
  r: number = 10,
): {
  d: string;
  sx: number; sy: number; ex: number; ey: number;
  pathCells: CellIdx[];
} {
  // --- Pass 1: A* on the 32-unit grid. Shares channels with previously
  // routed lines via the usedCells discount.
  const blocked = buildBlocked(positions, excludeIds);
  const src = { x: ax, y: ay };
  const dst = { x: bx, y: by };
  const exit = pickExitCell(src, dst, blocked);
  const entry = pickExitCell(dst, src, blocked);
  const path = aStarGrid(exit.idx, entry.idx, blocked, usedCells);
  if (path) {
    const cellCorners = pathToCorners(path);
    // cellCorners is [cellCenter(start), …direction-changes…, cellCenter(end)].
    // We discard the first/last (those were just stand-ins for the entry/exit
    // cells) and use the remaining INNER corners as the cell-grid spine.
    const inner = cellCorners.slice(1, -1);

    // Direction the line leaves each box on. Comes from pickExitCell —
    // 'h' means attach is on a left/right edge, 'v' means top/bottom.
    const horizExit = Math.abs(exit.exitX - exit.attachX) > 0.5;
    const horizEntry = Math.abs(entry.exitX - entry.attachX) > 0.5;

    const corners: Array<[number, number]> = [];
    corners.push([exit.attachX, exit.attachY]);

    // First grid-aligned target the line needs to reach. If A* found no
    // direction-change corners, the target is the entry attach point itself.
    const firstTarget: [number, number] =
      inner.length > 0 ? inner[0] : [entry.attachX, entry.attachY];

    // Bridge from the box edge along the attach axis until we line up with
    // firstTarget on the perpendicular axis — this guarantees a 90° corner
    // even though box edges (BOX_W=180, BOX_H=88) aren't aligned to the
    // 32-unit cell grid that A* runs on.
    if (horizExit) {
      if (Math.abs(firstTarget[1] - exit.attachY) > 0.5) {
        corners.push([firstTarget[0], exit.attachY]);
      }
    } else {
      if (Math.abs(firstTarget[0] - exit.attachX) > 0.5) {
        corners.push([exit.attachX, firstTarget[1]]);
      }
    }

    for (const c of inner) corners.push(c);

    // Mirror bridge on the entry side: line approaches the box on its
    // attach axis, so we need to align with the last inner corner first.
    if (inner.length > 0) {
      const lastInner = inner[inner.length - 1];
      if (horizEntry) {
        if (Math.abs(lastInner[1] - entry.attachY) > 0.5) {
          corners.push([lastInner[0], entry.attachY]);
        }
      } else {
        if (Math.abs(lastInner[0] - entry.attachX) > 0.5) {
          corners.push([entry.attachX, lastInner[1]]);
        }
      }
    }

    corners.push([entry.attachX, entry.attachY]);

    // Drop any consecutive duplicates / collinear midpoints so the curve
    // logic in pointsToPath doesn't see zero-length segments and round
    // them into degenerate arcs.
    const cleaned = dedupeCollinear(corners);

    return {
      d: pointsToPath(cleaned, r),
      sx: exit.attachX, sy: exit.attachY,
      ex: entry.attachX, ey: entry.attachY,
      pathCells: path,
    };
  }

  // --- Pass 2: fallback heuristic Z/S enumeration (only if A* found no
  // path — rare, but handles degenerate cases where endpoints are inside
  // blocked regions).
  const candidates: Array<{ segs: Segment[]; sx: number; sy: number; ex: number; ey: number; score: number }> = [];

  const pushCand = (built: { segments: Segment[]; sx: number; sy: number; ex: number; ey: number }) => {
    candidates.push({
      segs: built.segments,
      sx: built.sx, sy: built.sy, ex: built.ex, ey: built.ey,
      score: routeScore(built.segments, excludeIds, positions),
    });
  };

  // Z-shape at natural mid
  pushCand(zSegments(ax, ay, bx, by, (ax + bx) / 2));
  // S-shape at natural mid
  pushCand(sSegments(ax, ay, bx, by, (ay + by) / 2));
  // Z-shapes with mid-x shifted in 16-unit steps. Range covers up to
  // ~1200 units which is almost the full viewBox width — guarantees we can
  // find a vertical corridor anywhere on the canvas, including the extreme
  // left/right gutters which are always clear of boxes.
  const midXNatural = (ax + bx) / 2;
  for (let shift = 16; shift <= 1200; shift += 16) {
    pushCand(zSegments(ax, ay, bx, by, midXNatural + shift));
    pushCand(zSegments(ax, ay, bx, by, midXNatural - shift));
  }
  // S-shapes with mid-y shifted similarly — full viewBox height of reach.
  const midYNatural = (ay + by) / 2;
  for (let shift = 16; shift <= 800; shift += 16) {
    pushCand(sSegments(ax, ay, bx, by, midYNatural + shift));
    pushCand(sSegments(ax, ay, bx, by, midYNatural - shift));
  }
  // Extreme-edge fallbacks — these always have a clear vertical/horizontal
  // corridor because no box is at the very edge of the viewBox.
  pushCand(zSegments(ax, ay, bx, by, 40));
  pushCand(zSegments(ax, ay, bx, by, VIEW_W - 40));
  pushCand(sSegments(ax, ay, bx, by, 40));
  pushCand(sSegments(ax, ay, bx, by, VIEW_H - 40));

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  return {
    d: renderSegmentsAsPath(best.segs, best.sx, best.sy, best.ex, best.ey, r),
    sx: best.sx,
    sy: best.sy,
    ex: best.ex,
    ey: best.ey,
    pathCells: [],
  };
}

/**
 * Clamp a box's centre so its surrounding cluster rect (or for non-cluster
 * boxes like Dashboard, the box itself) keeps a CANVAS_MARGIN gap from the
 * viewBox edges. The exact margin depends on whether the box belongs to a
 * cluster — cluster boxes need extra room for the cluster padding + title
 * strip on top.
 */
function clampToCanvas(
  pos: { x: number; y: number },
  hasCluster: boolean,
): { x: number; y: number } {
  const xPad = CANVAS_MARGIN + (hasCluster ? CLUSTER_PAD : 0) + BOX_W / 2;
  const yPadTop = CANVAS_MARGIN + (hasCluster ? CLUSTER_TITLE_H : 0) + BOX_H / 2;
  const yPadBot = CANVAS_MARGIN + (hasCluster ? CLUSTER_PAD : 0) + BOX_H / 2;
  return {
    x: Math.max(xPad, Math.min(VIEW_W - xPad, pos.x)),
    y: Math.max(yPadTop, Math.min(VIEW_H - yPadBot, pos.y)),
  };
}

/**
 * Two boxes "intrude" on each other if their centres are closer than
 * (BOX_W + 16) horizontally AND (BOX_H + 16) vertically. That's the
 * condition for either overlap or insufficient gap.
 */
function intrudes(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  return (
    Math.abs(a.x - b.x) < BOX_W + 16 && Math.abs(a.y - b.y) < BOX_H + 16
  );
}

/**
 * Find the nearest snapped grid cell to `target` that doesn't intrude on any
 * other box. Spirals outward in 16-unit steps. Used at drag-end so dropped
 * boxes never overlap their neighbours.
 */
function findFreeCell(
  target: { x: number; y: number },
  excludeId: string,
  positions: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
  const startX = snap(target.x);
  const startY = snap(target.y);
  const isFree = (x: number, y: number) => {
    for (const [id, p] of positions) {
      if (id === excludeId) continue;
      if (intrudes({ x, y }, p)) return false;
    }
    return true;
  };
  if (isFree(startX, startY)) return { x: startX, y: startY };
  // Spiral outward in 16-unit increments. Cap at 40 rings (640 units away).
  for (let radius = 1; radius <= 40; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = startX + dx * SNAP_GRID;
        const y = startY + dy * SNAP_GRID;
        if (isFree(x, y)) return { x, y };
      }
    }
  }
  return { x: startX, y: startY };
}

/** Ease-in-out cubic — slow start AND slow finish. Feels deliberate, not snappy. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function isConnected(node: WireframeNode, envPresent: Set<string>): boolean {
  if (node.envVars.length === 0) return true;
  return node.envVars.every((v) => envPresent.has(v));
}

/** A flow is "live" when both its endpoints have all their env vars present. */
function flowIsLive(f: WireframeFlow, envPresent: Set<string>): boolean {
  const a = WIREFRAME_NODES.find((n) => n.id === f.from);
  const b = WIREFRAME_NODES.find((n) => n.id === f.to);
  if (!a || !b) return false;
  return isConnected(a, envPresent) && isConnected(b, envPresent);
}

/** Resolve account identifier + admin URL for a node, given the env values. */
function resolveAccount(
  node: WireframeNode,
  identifierValues: Record<string, string>,
): { identifier: string; url: string } | null {
  if (!node.account) return null;
  const id = node.account.identifierEnvVar
    ? identifierValues[node.account.identifierEnvVar] ?? null
    : node.account.identifierStatic ?? null;
  if (!id) return null;
  return {
    identifier: id,
    url: node.account.adminUrlTemplate.replace('{id}', id),
  };
}

export function WireframeDiagram({ envPresent: initialEnv, identifierValues }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<View>(IDENTITY);
  /** Tracks which node we're currently double-click-zoomed-in on (for toggle). */
  const [zoomedOnNode, setZoomedOnNode] = useState<string | null>(null);
  const [envPresent, setEnvPresent] = useState<Set<string>>(
    () => new Set(initialEnv),
  );
  /** Per-node positions — starts from defaults, mutated when a box is dragged. */
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    () => computeDefaultPositions(),
  );
  // Mirror of `positions` in a ref so resetView can read it synchronously
  // right after a Clean-up (state update hasn't flushed yet).
  const positionsRef = useRef(positions);
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  const containerRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const zoomAnimRef = useRef<number | null>(null);
  /** Per-box drag state — populated on mousedown, cleared on mouseup. */
  const dragStateRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    startNodeX: number;
    startNodeY: number;
    moved: boolean;
  } | null>(null);

  /** Helper: read a node's CURRENT position (from state). Initialised from defaults. */
  const posOf = (id: string): { x: number; y: number } =>
    positions.get(id) ?? { x: 0, y: 0 };

  const nodeMap = useMemo(
    () => new Map(WIREFRAME_NODES.map((n) => [n.id, n])),
    [],
  );

  const total = totalMonthlyGBP(WIREFRAME_NODES);
  const connectedTotal = WIREFRAME_NODES.filter((n) => isConnected(n, envPresent)).length;

  /**
   * Memoised routes for every flow. Recomputes only when positions change
   * — not on every render. Each route gets a discount on cells already
   * touched by earlier routes, so parallel connections collapse onto
   * shared backbones through the gaps between clusters.
   *
   * Routes are computed in order of flow length (shortest first) so the
   * short, unambiguous routes "claim" the natural channels first and the
   * longer cross-canvas routes follow them.
   */
  const routeMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof smartRoute>>();
    const usedCells = new Set<CellIdx>();
    // Order flows by Manhattan distance of source to dest — short first.
    const ordered = [...WIREFRAME_FLOWS].sort((a, b) => {
      const pa = positions.get(a.from), qa = positions.get(a.to);
      const pb = positions.get(b.from), qb = positions.get(b.to);
      if (!pa || !qa || !pb || !qb) return 0;
      const da = Math.abs(pa.x - qa.x) + Math.abs(pa.y - qa.y);
      const db = Math.abs(pb.x - qb.x) + Math.abs(pb.y - qb.y);
      return da - db;
    });
    for (const flow of ordered) {
      const fp = positions.get(flow.from);
      const tp = positions.get(flow.to);
      if (!fp || !tp) continue;
      const r = smartRoute(
        fp.x, fp.y, tp.x, tp.y,
        [flow.from, flow.to],
        positions,
        usedCells,
        16,
      );
      for (const c of r.pathCells) usedCells.add(c);
      map.set(`${flow.from}->${flow.to}`, r);
    }
    return map;
  }, [positions]);

  const activeFlows = useMemo(() => {
    if (!selection) return new Set<string>();
    const s = new Set<string>();
    if (selection.kind === 'node') {
      WIREFRAME_FLOWS.forEach((f) => {
        if (f.from === selection.id || f.to === selection.id) s.add(`${f.from}->${f.to}`);
      });
    } else {
      s.add(`${selection.from}->${selection.to}`);
    }
    return s;
  }, [selection]);

  const markEnvAdded = useCallback((key: string) => {
    setEnvPresent((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // ---- Zoom / pan --------------------------------------------------------

  const setZoomAround = useCallback(
    (factor: number, cx: number, cy: number) => {
      setView((v) => {
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * factor));
        const actualFactor = newZoom / v.zoom;
        // Zoom around (cx, cy) in container coords — keep that point stable.
        const newPanX = cx - (cx - v.panX) * actualFactor;
        const newPanY = cy - (cy - v.panY) * actualFactor;
        return { zoom: newZoom, panX: newPanX, panY: newPanY };
      });
    },
    [],
  );

  const resetView = useCallback(() => {
    // Extents = show the whole canvas at zoom=1 with no pan. The container
    // has aspect-ratio VIEW_W / VIEW_H so this exactly fills it, and every
    // cluster's ≥32-unit margin to the canvas edge becomes visible margin.
    const el = containerRef.current;
    if (!el) return;
    const targetZoom = 1;
    const targetPanX = 0;
    const targetPanY = 0;

    const startView = view;
    const duration = 420;
    const t0 = performance.now();
    if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const ease = easeInOutCubic(t);
      setView({
        zoom: startView.zoom + (targetZoom - startView.zoom) * ease,
        panX: startView.panX + (targetPanX - startView.panX) * ease,
        panY: startView.panY + (targetPanY - startView.panY) * ease,
      });
      if (t < 1) zoomAnimRef.current = requestAnimationFrame(step);
    };
    zoomAnimRef.current = requestAnimationFrame(step);
  }, [view]);

  const focusNode = useCallback(
    (id: string, zoomLevel = 1.6) => {
      const n = nodeMap.get(id);
      const el = containerRef.current;
      if (!n || !el) return;
      const p = positions.get(id) ?? { x: n.x, y: n.y };
      const rect = el.getBoundingClientRect();
      const targetZoom = zoomLevel;
      const renderedCx = (p.x / VIEW_W) * rect.width;
      const renderedCy = (p.y / VIEW_H) * rect.height;
      const targetPanX = rect.width / 2 - renderedCx * targetZoom;
      const targetPanY = rect.height / 2 - renderedCy * targetZoom;
      const startView = view;
      const duration = 460;
      const t0 = performance.now();
      if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const ease = easeInOutCubic(t);
        setView({
          zoom: startView.zoom + (targetZoom - startView.zoom) * ease,
          panX: startView.panX + (targetPanX - startView.panX) * ease,
          panY: startView.panY + (targetPanY - startView.panY) * ease,
        });
        if (t < 1) zoomAnimRef.current = requestAnimationFrame(step);
      };
      zoomAnimRef.current = requestAnimationFrame(step);
    },
    [nodeMap, view, positions],
  );

  const focusPair = useCallback(
    (fromId: string, toId: string) => {
      const a = nodeMap.get(fromId);
      const b = nodeMap.get(toId);
      const el = containerRef.current;
      if (!a || !b || !el) return;
      const ap = positions.get(fromId) ?? { x: a.x, y: a.y };
      const bp = positions.get(toId) ?? { x: b.x, y: b.y };
      const rect = el.getBoundingClientRect();
      // Compute bbox around the two nodes in viewBox coords
      const pad = BOX_W; // generous padding so the boxes breathe
      const minX = Math.min(ap.x, bp.x) - BOX_W / 2 - pad / 2;
      const maxX = Math.max(ap.x, bp.x) + BOX_W / 2 + pad / 2;
      const minY = Math.min(ap.y, bp.y) - BOX_H / 2 - pad / 2;
      const maxY = Math.max(ap.y, bp.y) + BOX_H / 2 + pad / 2;
      const bboxW = maxX - minX;
      const bboxH = maxY - minY;
      // The container renders the viewBox at (rect.width / VIEW_W) pixels per unit.
      // New zoom = how many times larger to make the rendered content so bbox fills the container.
      const zoomX = VIEW_W / bboxW;
      const zoomY = VIEW_H / bboxH;
      const targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));
      // Centre of bbox in viewBox coords
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      // Convert viewBox coord to rendered pixels at zoom=1
      const renderedCx = (cx / VIEW_W) * rect.width;
      const renderedCy = (cy / VIEW_H) * rect.height;
      // Pan so rendered bbox centre lands at container centre after scaling
      const targetPanX = rect.width / 2 - renderedCx * targetZoom;
      const targetPanY = rect.height / 2 - renderedCy * targetZoom;
      // Animate with ease-in-out
      const startView = view;
      const duration = 520;
      const t0 = performance.now();
      if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const ease = easeInOutCubic(t);
        setView({
          zoom: startView.zoom + (targetZoom - startView.zoom) * ease,
          panX: startView.panX + (targetPanX - startView.panX) * ease,
          panY: startView.panY + (targetPanY - startView.panY) * ease,
        });
        if (t < 1) zoomAnimRef.current = requestAnimationFrame(step);
      };
      zoomAnimRef.current = requestAnimationFrame(step);
    },
    [nodeMap, view, positions],
  );

  /** Animate one or more box positions to target coordinates with ease-in-out.
   *  Used for grid-snap on drag-end and cluster snap-in. */
  const animatePositions = useCallback(
    (updates: Array<{ id: string; target: { x: number; y: number } }>) => {
      const starts = new Map<string, { x: number; y: number }>();
      for (const u of updates) {
        const cur = positionsRef.current.get(u.id);
        if (cur) starts.set(u.id, cur);
      }
      if (starts.size === 0) return;
      const duration = 220;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const ease = easeInOutCubic(t);
        setPositions((prev) => {
          const next = new Map(prev);
          for (const u of updates) {
            const s = starts.get(u.id);
            if (!s) continue;
            next.set(u.id, {
              x: s.x + (u.target.x - s.x) * ease,
              y: s.y + (u.target.y - s.y) * ease,
            });
          }
          return next;
        });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    [],
  );

  /** Animate fit-to-bbox for a list of node ids (used for cluster zoom).
   *  When the ids form a cluster, we expand the bbox out to the cluster
   *  rect bounds (asymmetric — CLUSTER_PAD sides/bottom, CLUSTER_TITLE_H
   *  top) so the visible margin is consistent on every side, not tighter
   *  on top because of the title strip. */
  const focusBbox = useCallback(
    (ids: string[]) => {
      const el = containerRef.current;
      if (!el) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of ids) {
        const p = positionsRef.current.get(id);
        if (!p) continue;
        minX = Math.min(minX, p.x - BOX_W / 2);
        minY = Math.min(minY, p.y - BOX_H / 2);
        maxX = Math.max(maxX, p.x + BOX_W / 2);
        maxY = Math.max(maxY, p.y + BOX_H / 2);
      }
      // If any of the ids is in a cluster, expand the bbox to cover the
      // cluster rect's actual extents (which are asymmetric top-to-bottom).
      const anyClustered = ids.some((id) => {
        const n = WIREFRAME_NODES.find((nn) => nn.id === id);
        return !!n?.cluster;
      });
      if (anyClustered) {
        minX -= CLUSTER_PAD;
        maxX += CLUSTER_PAD;
        minY -= CLUSTER_TITLE_H;
        maxY += CLUSTER_PAD;
      }
      // Then pad outward so there's a consistent 32-unit-equivalent visible
      // margin between cluster rect and container edge at any zoom level.
      const pad = CANVAS_MARGIN; // 32 viewBox units
      minX -= pad; minY -= pad; maxX += pad; maxY += pad;
      const bboxW = maxX - minX;
      const bboxH = maxY - minY;
      const rect = el.getBoundingClientRect();
      const targetZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, Math.min(VIEW_W / bboxW, VIEW_H / bboxH)),
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const renderedCx = (cx / VIEW_W) * rect.width;
      const renderedCy = (cy / VIEW_H) * rect.height;
      const targetPanX = rect.width / 2 - renderedCx * targetZoom;
      const targetPanY = rect.height / 2 - renderedCy * targetZoom;
      const startView = view;
      const duration = 460;
      const t0 = performance.now();
      if (zoomAnimRef.current) cancelAnimationFrame(zoomAnimRef.current);
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        const ease = easeInOutCubic(t);
        setView({
          zoom: startView.zoom + (targetZoom - startView.zoom) * ease,
          panX: startView.panX + (targetPanX - startView.panX) * ease,
          panY: startView.panY + (targetPanY - startView.panY) * ease,
        });
        if (t < 1) zoomAnimRef.current = requestAnimationFrame(step);
      };
      zoomAnimRef.current = requestAnimationFrame(step);
    },
    [view],
  );

  /** Reset all box positions to their defaults (called by the "Clean up" button).
   *  Animates every box back to its grid position with ease-in-out instead of
   *  snapping instantly, and then fits the view to extents. Each default is
   *  clamped to canvas margin as a safety net. */
  const resetLayout = useCallback(() => {
    const fresh = computeDefaultPositions();
    // Safety: clamp every default to canvas margin in case a cluster centre
    // in wireframe.ts accidentally places a box too near the edge.
    fresh.forEach((pos, id) => {
      const node = WIREFRAME_NODES.find((n) => n.id === id);
      if (node) fresh.set(id, clampToCanvas(pos, !!node.cluster));
    });
    const updates: Array<{ id: string; target: { x: number; y: number } }> = [];
    fresh.forEach((target, id) => updates.push({ id, target }));
    animatePositions(updates);
    setZoomedOnNode(null);
    // Wait for the box animation to settle before fitting to extents.
    setTimeout(() => {
      // Sync ref + state again for safety (animation may still be flushing).
      positionsRef.current = fresh;
      resetView();
    }, 260);
  }, [animatePositions, resetView]);

  /** On first mount, fit-to-extents so the whole diagram shows in the viewport. */
  useEffect(() => {
    // setTimeout 0 lets the layout settle before we measure container dims.
    const t = setTimeout(() => resetView(), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll/pinch intentionally does NOT zoom the diagram — Craig wants to be
  // able to scroll the page over the diagram without accidentally zooming.
  // Zoom is driven exclusively by the +/- buttons below and the keyboard
  // shortcuts.

  // Keyboard: 0 = reset, +/- = zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === '0') {
        e.preventDefault();
        resetView();
      } else if (e.key === '+' || e.key === '=') {
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setZoomAround(1 + ZOOM_STEP, r.width / 2, r.height / 2);
      } else if (e.key === '-' || e.key === '_') {
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setZoomAround(1 - ZOOM_STEP, r.width / 2, r.height / 2);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetView, setZoomAround]);

  // Drag-to-pan on empty diagram surface
  const onPanStart = (e: React.MouseEvent) => {
    // Only start pan if clicked directly on the container, not on a box or line
    if (e.target !== e.currentTarget && !(e.target as Element).closest('svg')) return;
    // Allow pan on SVG empty space (not on interactive line) — we handle line clicks in stopPropagation
    panStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: view.panX,
      panY: view.panY,
    };
  };
  const onPanMove = (e: React.MouseEvent) => {
    const p = panStateRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    setView((v) => ({ ...v, panX: p.panX + dx, panY: p.panY + dy }));
  };
  const onPanEnd = () => {
    panStateRef.current = null;
  };

  // ---- Render ------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Sticky summary strip — cost, connected count, zoom controls, clean-up, info icon */}
      <SummaryStrip
        total={total}
        connectedTotal={connectedTotal}
        nodeCount={WIREFRAME_NODES.length}
        zoom={view.zoom}
        onZoomIn={() => {
          const el = containerRef.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          setZoomAround(1 + ZOOM_STEP, r.width / 2, r.height / 2);
        }}
        onZoomOut={() => {
          const el = containerRef.current;
          if (!el) return;
          const r = el.getBoundingClientRect();
          setZoomAround(1 - ZOOM_STEP, r.width / 2, r.height / 2);
        }}
        onResetView={resetView}
        onCleanLayout={resetLayout}
      />

      {/* Diagram — pan/zoom container */}
      <div
        ref={containerRef}
        className="relative w-full rounded-xl bg-evari-surface overflow-hidden select-none"
        style={{
          aspectRatio: `${VIEW_W} / ${VIEW_H}`,
          cursor: panStateRef.current ? 'grabbing' : 'grab',
        }}
        onClick={(e) => {
          // Click on empty area → clear selection (unless user was panning)
          if (e.target === e.currentTarget) setSelection(null);
        }}
        onMouseDown={onPanStart}
        onMouseMove={onPanMove}
        onMouseUp={onPanEnd}
        onMouseLeave={onPanEnd}
      >
        {/* Transformed content wrapper */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            transformOrigin: '0 0',
            // No CSS transition — rAF setView already drives every frame.
            // A CSS transition here would lag behind the rAF target and
            // produce the "wobbly" feel we're ironing out.
          }}
        >
          {/* Cluster background rectangles — drawn behind everything else.
              The label-strip at the top is a drag handle that moves the whole
              cluster (all member boxes translated by the same delta). */}
          {Object.entries(CLUSTERS).map(([clusterId, meta]) => {
            const members = WIREFRAME_NODES.filter((n) => n.cluster === clusterId);
            if (members.length === 0) return null;
            // Cluster rect: 32 units padding on left/right/bottom (CLUSTER_PAD),
            // and CLUSTER_TITLE_H at the top to fit the title (with 16px above it).
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const m of members) {
              const p = posOf(m.id);
              minX = Math.min(minX, p.x - BOX_W / 2);
              minY = Math.min(minY, p.y - BOX_H / 2);
              maxX = Math.max(maxX, p.x + BOX_W / 2);
              maxY = Math.max(maxY, p.y + BOX_H / 2);
            }
            const left = ((minX - CLUSTER_PAD) / VIEW_W) * 100;
            const top = ((minY - CLUSTER_TITLE_H) / VIEW_H) * 100;
            const width = ((maxX - minX + CLUSTER_PAD * 2) / VIEW_W) * 100;
            const height = ((maxY - minY + CLUSTER_PAD + CLUSTER_TITLE_H) / VIEW_H) * 100;
            // Cluster width in viewBox units — needed to compute the title's
            // 20-unit horizontal offset as a percentage of the cluster's own
            // width (since absolute children use parent dims for percent).
            const clusterWidthVb = maxX - minX + CLUSTER_PAD * 2;
            // Colour-blind-friendly signal: the cluster label AND its outline
            // turn bright green when every member of this cluster is live
            // (not just a subtle "all-green-dot" per-box signal). Required,
            // non-optional members must be connected; optional members can be
            // skipped without breaking the "all green" state.
            const requiredMembers = members.filter((m) => !m.optional);
            const allLive =
              requiredMembers.length > 0 &&
              requiredMembers.every((m) => isConnected(m, envPresent));
            return (
              <div
                key={clusterId}
                className="absolute pointer-events-none"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: `${width}%`,
                  height: `${height}%`,
                  background: meta.fillVar,
                  borderRadius: '16px',
                  // Cluster outline gains a bright green border when every
                  // required member is connected. This is the most visible
                  // colour-blind-friendly "cluster is live" signal.
                  boxShadow: allLive
                    ? 'inset 0 0 0 1.5px rgb(var(--evari-success))'
                    : 'none',
                  transition: 'box-shadow 200ms ease-in-out',
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 pointer-events-auto cursor-grab active:cursor-grabbing rounded-t-2xl hover:bg-evari-gold/10 transition-colors"
                  style={{ height: `${(CLUSTER_TITLE_H / VIEW_H) * 100}%` }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    focusBbox(members.map((m) => m.id));
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const el = containerRef.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const scaleX = rect.width / VIEW_W;
                    const scaleY = rect.height / VIEW_H;
                    const memberIds = members.map((m) => m.id);
                    const starts = new Map<string, { x: number; y: number }>();
                    memberIds.forEach((id) => {
                      const p = positionsRef.current.get(id);
                      if (p) starts.set(id, { ...p });
                    });
                    const startClientX = e.clientX;
                    const startClientY = e.clientY;
                    let moved = false;
                    const onMove = (ev: MouseEvent) => {
                      const dxClient = ev.clientX - startClientX;
                      const dyClient = ev.clientY - startClientY;
                      if (!moved && Math.abs(dxClient) + Math.abs(dyClient) < 4) return;
                      moved = true;
                      let dx = dxClient / (scaleX * view.zoom);
                      let dy = dyClient / (scaleY * view.zoom);
                      // Clamp delta during drag so the cluster can't be
                      // pushed past the 32-unit canvas margin even while
                      // the mouse is still down.
                      let maxDx = Infinity, minDx = -Infinity;
                      let maxDy = Infinity, minDy = -Infinity;
                      memberIds.forEach((id) => {
                        const s = starts.get(id);
                        if (!s) return;
                        const xLow = clampToCanvas({ x: -1e9, y: s.y }, true).x;
                        const xHigh = clampToCanvas({ x: 1e9, y: s.y }, true).x;
                        const yLow = clampToCanvas({ x: s.x, y: -1e9 }, true).y;
                        const yHigh = clampToCanvas({ x: s.x, y: 1e9 }, true).y;
                        maxDx = Math.min(maxDx, xHigh - s.x);
                        minDx = Math.max(minDx, xLow - s.x);
                        maxDy = Math.min(maxDy, yHigh - s.y);
                        minDy = Math.max(minDy, yLow - s.y);
                      });
                      dx = Math.max(minDx, Math.min(maxDx, dx));
                      dy = Math.max(minDy, Math.min(maxDy, dy));
                      setPositions((prev) => {
                        const next = new Map(prev);
                        memberIds.forEach((id) => {
                          const s = starts.get(id);
                          if (!s) return;
                          next.set(id, { x: s.x + dx, y: s.y + dy });
                        });
                        return next;
                      });
                    };
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove);
                      window.removeEventListener('mouseup', onUp);
                      if (!moved) return;
                      // Snap the whole cluster to the grid, applying the same
                      // delta to every member (preserves intra-cluster gaps).
                      // Use the first member as the reference point.
                      const first = memberIds[0];
                      const cur = positionsRef.current.get(first);
                      const start = starts.get(first);
                      if (!cur || !start) return;
                      const snappedFirst = { x: snap(cur.x), y: snap(cur.y) };
                      let dxSnap = snappedFirst.x - cur.x;
                      let dySnap = snappedFirst.y - cur.y;

                      // Two-pass delta clamp — compute the min/max allowed
                      // delta across every member first, THEN apply the
                      // capped delta uniformly. This is the correct way to
                      // keep the whole cluster inside the 32-unit canvas
                      // margin without drifting.
                      let maxDx = Infinity, minDx = -Infinity;
                      let maxDy = Infinity, minDy = -Infinity;
                      memberIds.forEach((id) => {
                        const c = positionsRef.current.get(id);
                        if (!c) return;
                        const xLow = clampToCanvas({ x: -1e9, y: c.y }, true).x;
                        const xHigh = clampToCanvas({ x: 1e9, y: c.y }, true).x;
                        const yLow = clampToCanvas({ x: c.x, y: -1e9 }, true).y;
                        const yHigh = clampToCanvas({ x: c.x, y: 1e9 }, true).y;
                        maxDx = Math.min(maxDx, xHigh - c.x);
                        minDx = Math.max(minDx, xLow - c.x);
                        maxDy = Math.min(maxDy, yHigh - c.y);
                        minDy = Math.max(minDy, yLow - c.y);
                      });
                      dxSnap = Math.max(minDx, Math.min(maxDx, dxSnap));
                      dySnap = Math.max(minDy, Math.min(maxDy, dySnap));

                      const updates: Array<{ id: string; target: { x: number; y: number } }> = [];
                      memberIds.forEach((id) => {
                        const c = positionsRef.current.get(id);
                        if (c) {
                          updates.push({
                            id,
                            target: { x: c.x + dxSnap, y: c.y + dySnap },
                          });
                        }
                      });
                      animatePositions(updates);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                  }}
                >
                  <div
                    className={cn(
                      'absolute text-[10px] uppercase tracking-[0.18em] pointer-events-none font-medium transition-colors',
                      // Bright green when all required members are wired up
                      // — the primary colour-blind-friendly "cluster live"
                      // signal. Gold highlight fades when just hovered.
                      allLive ? 'text-evari-success' : 'text-evari-dimmer',
                    )}
                    style={{
                      left: `${(20 / clusterWidthVb) * 100}%`,
                      top: `${(20 / CLUSTER_TITLE_H) * 100}%`,
                    }}
                  >
                    {meta.label}
                    {allLive && <span className="ml-2 text-evari-success">●</span>}
                  </div>
                </div>
              </div>
            );
          })}

          {/* SVG layer for edges */}
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full pointer-events-auto"
            style={{ pointerEvents: 'none' }}
          >
            <defs>
              <marker
                id="wf-arrow-dim"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--evari-dimmer))" />
              </marker>
              <marker
                id="wf-arrow-gold"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--evari-gold))" />
              </marker>
              <marker
                id="wf-arrow-green"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--evari-success))" />
              </marker>
              <marker
                id="wf-arrow-red"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--evari-danger))" />
              </marker>
            </defs>
            {WIREFRAME_FLOWS.map((e, i) => {
              const from = nodeMap.get(e.from);
              const to = nodeMap.get(e.to);
              if (!from || !to) return null;
              const flowKey = `${e.from}->${e.to}`;
              const active = activeFlows.has(flowKey);
              const hot = hovered === e.from || hovered === e.to || hovered === flowKey;
              const highlight = active || hot;
              const live = flowIsLive(e, envPresent);
              // When a flow is highlighted, colour by liveness:
              //   live → green (this connection is actually working right now)
              //   not live → red (one or both endpoints missing credentials)
              // When no highlight, dashed dim. Hovered without selection still
              // gets a colour — green if live, red if not — so the user can
              // pre-judge before clicking.
              const stroke = highlight
                ? live
                  ? 'rgb(var(--evari-success))'
                  : 'rgb(var(--evari-danger))'
                : 'rgb(var(--evari-dimmer) / 0.5)';
              const marker = highlight
                ? live
                  ? 'url(#wf-arrow-green)'
                  : 'url(#wf-arrow-red)'
                : 'url(#wf-arrow-dim)';

              // Use pre-computed route from the memoised route map — no
              // per-render A* recomputation. Falls through to a trivial
              // straight line if something goes wrong with the lookup.
              const route = routeMap.get(`${from.id}->${to.id}`) ?? {
                d: '',
                sx: 0, sy: 0, ex: 0, ey: 0,
                pathCells: [],
              };

              return (
                <g
                  key={i}
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={(evt) => {
                    // Single-click on a line just opens the flow panel — no
                    // zoom. Double-click triggers the fit-to-extent animation.
                    evt.stopPropagation();
                    setSelection({ kind: 'flow', from: e.from, to: e.to });
                  }}
                  onDoubleClick={(evt) => {
                    evt.stopPropagation();
                    setSelection({ kind: 'flow', from: e.from, to: e.to });
                    focusPair(e.from, e.to);
                  }}
                  onMouseEnter={() => setHovered(flowKey)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Fat invisible path = generous click target */}
                  <path
                    d={route.d}
                    stroke="transparent"
                    strokeWidth={20}
                    fill="none"
                  />
                  {/* The visible orthogonal route with 10px rounded corners */}
                  <path
                    d={route.d}
                    stroke={stroke}
                    strokeWidth={highlight ? 1.6 : 0.9}
                    strokeDasharray={highlight ? '0' : '4 4'}
                    fill="none"
                  />
                  {/* Small circles at each attach point */}
                  <circle cx={route.sx} cy={route.sy} r={3.5} fill={stroke} />
                  <circle cx={route.ex} cy={route.ey} r={3.5} fill={stroke} />
                </g>
              );
            })}
          </svg>

          {/* Boxes layer */}
          <div className="absolute inset-0">
            {WIREFRAME_NODES.map((n) => {
              const connected = isConnected(n, envPresent);
              const tier = TIER_META[n.tier];
              const isHovered = hovered === n.id;
              const isSelected =
                selection?.kind === 'node' && selection.id === n.id;
              const isRelated =
                selection?.kind === 'flow' &&
                (selection.from === n.id || selection.to === n.id);
              const np = posOf(n.id);
              const leftPct = (np.x / VIEW_W) * 100;
              const topPct = (np.y / VIEW_H) * 100;
              const account = resolveAccount(n, identifierValues);
              return (
                <button
                  type="button"
                  key={n.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    // If we actually dragged, don't also fire a select.
                    if (dragStateRef.current?.moved) {
                      dragStateRef.current = null;
                      return;
                    }
                    setSelection({ kind: 'node', id: n.id });
                    focusNode(n.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Double-click toggles between "zoomed in close on this box"
                    // and "fit to extents". If you're already zoomed in on this
                    // exact box → return to extents. Otherwise zoom in hard.
                    if (zoomedOnNode === n.id) {
                      setZoomedOnNode(null);
                      resetView();
                    } else {
                      setZoomedOnNode(n.id);
                      focusNode(n.id, 2.4);
                    }
                  }}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    // Start potential drag. We wait for the first mouse move
                    // before committing to drag-mode (so click-without-move
                    // still selects). Drag maths translates client pixels
                    // into viewBox coords using the live zoom.
                    const startP = posOf(n.id);
                    dragStateRef.current = {
                      nodeId: n.id,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startNodeX: startP.x,
                      startNodeY: startP.y,
                      moved: false,
                    };
                    const el = containerRef.current;
                    if (!el) return;
                    const rect = el.getBoundingClientRect();
                    const scaleX = rect.width / VIEW_W;
                    const scaleY = rect.height / VIEW_H;

                    const onMove = (ev: MouseEvent) => {
                      const ds = dragStateRef.current;
                      if (!ds) return;
                      const dxClient = ev.clientX - ds.startClientX;
                      const dyClient = ev.clientY - ds.startClientY;
                      // 4px threshold — under this we treat it as a click.
                      if (!ds.moved && Math.abs(dxClient) + Math.abs(dyClient) < 4) return;
                      ds.moved = true;
                      // Convert client pixel delta → viewBox units,
                      // accounting for current zoom level.
                      const dxView = dxClient / (scaleX * view.zoom);
                      const dyView = dyClient / (scaleY * view.zoom);
                      // Clamp to canvas margin during the drag itself, so
                      // the box can never be dragged past the 32-unit edge.
                      const clamped = clampToCanvas(
                        { x: ds.startNodeX + dxView, y: ds.startNodeY + dyView },
                        !!n.cluster,
                      );
                      setPositions((prev) => {
                        const next = new Map(prev);
                        next.set(ds.nodeId, clamped);
                        return next;
                      });
                    };
                    const onUp = () => {
                      window.removeEventListener('mousemove', onMove);
                      window.removeEventListener('mouseup', onUp);
                      const ds = dragStateRef.current;
                      // If we actually dragged, snap to the nearest free grid
                      // cell (no overlap with neighbours) and ease into place.
                      if (ds?.moved) {
                        const current = positionsRef.current.get(ds.nodeId);
                        if (current) {
                          // Snap to nearest free grid cell, then clamp
                          // the final target so the cluster rect can't
                          // cross the 32-unit canvas margin.
                          const freeCell = findFreeCell(
                            current,
                            ds.nodeId,
                            positionsRef.current,
                          );
                          const clamped = clampToCanvas(
                            freeCell,
                            !!n.cluster,
                          );
                          animatePositions([{ id: ds.nodeId, target: clamped }]);
                        }
                      }
                      // Note: we DON'T clear dragStateRef here — the click
                      // handler reads `moved` to decide whether to select.
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                  }}
                  className={cn(
                    'absolute rounded-lg bg-evari-surfaceSoft px-3 py-2 transition-shadow text-left',
                    'shadow-[0_2px_12px_rgba(0,0,0,0.25)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.35)]',
                    (isHovered || isSelected || isRelated) && 'ring-1 ring-evari-gold z-20',
                    isSelected && 'scale-[1.03]',
                  )}
                  style={{
                    width: `${(BOX_W / VIEW_W) * 100}%`,
                    height: `${(BOX_H / VIEW_H) * 100}%`,
                    left: `calc(${leftPct}% - ${(BOX_W / VIEW_W) * 50}%)`,
                    top: `calc(${topPct}% - ${(BOX_H / VIEW_H) * 50}%)`,
                    cursor: dragStateRef.current?.nodeId === n.id ? 'grabbing' : 'grab',
                  }}
                >
                  <div className="flex flex-col h-full justify-between gap-1">
                    {/* Top row: status dot + label + opt + tier */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            connected ? 'bg-evari-success' : 'bg-evari-dimmer',
                          )}
                        />
                        <div className="text-[13px] font-medium text-evari-text truncate">
                          {n.label}
                        </div>
                        {n.optional && (
                          <span
                            className="text-[8px] uppercase tracking-[0.1em] px-1 py-0.5 rounded text-evari-dimmer bg-evari-surface shrink-0"
                            title="Optional — dashboard works without this"
                          >
                            opt
                          </span>
                        )}
                      </div>
                      <div
                        className={cn(
                          'text-[8px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0',
                          tier.accent,
                          'text-evari-dim',
                        )}
                      >
                        {tier.label}
                      </div>
                    </div>

                    {/* Role */}
                    <div className="text-[10px] text-evari-dim leading-tight line-clamp-1">
                      {n.role}
                    </div>

                    {/* Bottom row: username lozenge (left) + cost (right) */}
                    <div className="flex items-end justify-between gap-2 mt-auto">
                      {account ? (
                        <a
                          href={account.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          title={`Open ${n.label} as ${account.identifier}`}
                          className="inline-flex items-center gap-1 max-w-[60%] truncate text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-evari-surface text-evari-dim hover:text-evari-gold hover:bg-evari-surface/80 transition-colors"
                        >
                          <ExternalLink className="h-2 w-2 shrink-0" />
                          <span className="truncate">{account.identifier}</span>
                        </a>
                      ) : (
                        <span className="text-[9px] italic text-evari-dimmer">
                          {n.account?.identifierPlaceholder ?? ''}
                        </span>
                      )}
                      <div className="flex items-baseline gap-1 shrink-0">
                        <span className="text-[12px] font-mono tabular-nums text-evari-text">
                          {n.costGBP === 0 ? 'Free' : `£${n.costGBP}`}
                        </span>
                        <span className="text-[9px] text-evari-dimmer">
                          /mo
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Detail panel */}
      {selection?.kind === 'node' && (
        <NodeDetail
          node={nodeMap.get(selection.id)!}
          envPresent={envPresent}
          identifierValues={identifierValues}
          onEnvSaved={markEnvAdded}
          onClose={() => setSelection(null)}
        />
      )}
      {selection?.kind === 'flow' && (
        <FlowDetail
          flow={
            WIREFRAME_FLOWS.find(
              (f) => f.from === selection.from && f.to === selection.to,
            )!
          }
          fromNode={nodeMap.get(selection.from)!}
          toNode={nodeMap.get(selection.to)!}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}

// --- Sticky summary strip (cost + connected + zoom + info dropdown) -----

function SummaryStrip({
  total,
  connectedTotal,
  nodeCount,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
  onCleanLayout,
}: {
  total: number;
  connectedTotal: number;
  nodeCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onCleanLayout: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close info popover on outside click
  useEffect(() => {
    if (!infoOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [infoOpen]);

  return (
    <div className="sticky top-0 z-30 bg-evari-ink -mx-6 px-6 pt-1 pb-2">
      <div className="flex items-center gap-6 px-4 py-3 rounded-lg bg-evari-surface shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
            Monthly cost
          </div>
          <div className="text-2xl font-mono tabular-nums text-evari-text mt-0.5">
            {formatGBP(total)}
          </div>
        </div>
        <div className="h-10 w-px bg-evari-edge" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
            Connected
          </div>
          <div className="text-2xl font-mono tabular-nums text-evari-text mt-0.5">
            {connectedTotal} / {nodeCount}
          </div>
        </div>

        {/* Push zoom + info to the right */}
        <div className="flex-1" />

        {/* Zoom controls — always visible here while page scrolls */}
        <div className="flex items-center gap-1 bg-evari-surfaceSoft/70 rounded-lg p-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomOut();
            }}
            className="h-7 w-7 rounded-md hover:bg-evari-surface inline-flex items-center justify-center text-evari-dim hover:text-evari-text transition-colors"
            title="Zoom out (- key)"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] font-mono tabular-nums text-evari-dim px-1.5 min-w-[36px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoomIn();
            }}
            className="h-7 w-7 rounded-md hover:bg-evari-surface inline-flex items-center justify-center text-evari-dim hover:text-evari-text transition-colors"
            title="Zoom in (+ key)"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <div className="h-5 w-px bg-evari-edge mx-0.5" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResetView();
            }}
            className="h-7 px-2 rounded-md hover:bg-evari-surface inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-evari-dim hover:text-evari-text transition-colors"
            title="Zoom extents (0 key)"
          >
            <Maximize2 className="h-3 w-3" />
            Extents
          </button>
        </div>

        {/* Clean up layout — resets every box to its default equal-spaced position */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCleanLayout();
          }}
          className="h-8 px-3 rounded-md inline-flex items-center gap-1.5 bg-evari-surfaceSoft/70 text-evari-dim hover:text-evari-text hover:bg-evari-surface transition-colors text-[10px] uppercase tracking-[0.1em]"
          title="Reset every box to its default position"
        >
          <LayoutGrid className="h-3 w-3" />
          Clean up
        </button>

        {/* Info dropdown */}
        <div ref={wrapperRef} className="relative">
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className={cn(
              'h-8 w-8 rounded-md inline-flex items-center justify-center transition-colors',
              infoOpen
                ? 'bg-evari-gold text-evari-goldInk'
                : 'bg-evari-surfaceSoft/70 text-evari-dim hover:text-evari-text',
            )}
            title="How everything connects"
            aria-expanded={infoOpen}
          >
            <Info className="h-4 w-4" />
          </button>
          {infoOpen && (
            <div className="absolute right-0 top-10 w-[380px] rounded-lg bg-evari-surfaceSoft shadow-[0_8px_40px_rgba(0,0,0,0.5)] z-40 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-2">
                How everything connects
              </div>
              <p className="text-xs text-evari-dim leading-relaxed">
                Each box is a service. Click one to centre it and see what
                it does, what we manage here vs in the service itself, the
                business outcomes, a cost breakdown, and an AI window to
                ask context-specific questions.
              </p>
              <p className="text-xs text-evari-dim leading-relaxed mt-2">
                Click any arrow to see exactly what data moves which way.
                Double-click an arrow to fit both connected boxes to the
                screen.
              </p>
              <p className="text-xs text-evari-dim leading-relaxed mt-2">
                Lines turn <span className="text-evari-success">green</span>{' '}
                when both ends are connected — that connection is live
                right now. Lines turn{' '}
                <span className="text-evari-danger">red</span> when
                credentials are missing on one or both ends.
              </p>
              <div className="mt-3 pt-3 border-t border-evari-edge text-[10px] text-evari-dimmer leading-snug">
                Keyboard: <code className="text-evari-dim">0</code> reset,{' '}
                <code className="text-evari-dim">+</code> zoom in,{' '}
                <code className="text-evari-dim">−</code> zoom out.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Node detail --------------------------------------------------------

function NodeDetail({
  node,
  envPresent,
  identifierValues,
  onEnvSaved,
  onClose,
}: {
  node: WireframeNode;
  envPresent: Set<string>;
  identifierValues: Record<string, string>;
  onEnvSaved: (key: string) => void;
  onClose: () => void;
}) {
  const connected =
    node.envVars.length === 0 ||
    node.envVars.every((v) => envPresent.has(v));
  const relatedFlows = WIREFRAME_FLOWS.filter(
    (f) => f.from === node.id || f.to === node.id,
  );
  const isDashboard = node.id === 'dashboard';

  // Resolve the account identifier (env-driven or static) and admin URL.
  const accountIdentifier =
    node.account?.identifierEnvVar
      ? identifierValues[node.account.identifierEnvVar] ?? null
      : node.account?.identifierStatic ?? null;
  const accountUrl = node.account
    ? node.account.adminUrlTemplate.replace('{id}', accountIdentifier ?? '')
    : null;

  // Helper used by the Connections list — green if BOTH endpoints have all
  // their env vars present, otherwise red.
  function flowIsLive(f: WireframeFlow): boolean {
    const a = WIREFRAME_NODES.find((n) => n.id === f.from);
    const b = WIREFRAME_NODES.find((n) => n.id === f.to);
    if (!a || !b) return false;
    const aOk = a.envVars.length === 0 || a.envVars.every((v) => envPresent.has(v));
    const bOk = b.envVars.length === 0 || b.envVars.every((v) => envPresent.has(v));
    return aOk && bOk;
  }

  return (
    <div className="rounded-xl bg-evari-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-5 py-4 bg-evari-surfaceSoft">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'h-2 w-2 rounded-full shrink-0',
                connected ? 'bg-evari-success' : 'bg-evari-dimmer',
              )}
            />
            <h2 className="text-base font-medium text-evari-text">{node.label}</h2>
            <span className="text-xs text-evari-dim">· {node.role}</span>
            {node.optional && (
              <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-evari-surface text-evari-dim">
                optional
              </span>
            )}
          </div>
          <p className="text-sm text-evari-dim mt-2 leading-relaxed max-w-3xl">
            {node.blurb}
          </p>
        </div>
        <div className="flex items-start gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
              Monthly
            </div>
            <div className="text-lg font-mono tabular-nums text-evari-text mt-0.5">
              {node.costGBP === 0 ? 'Free' : formatGBP(node.costGBP)}
            </div>
            <div className="text-[10px] text-evari-dimmer">{node.costNote}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full hover:bg-evari-surface inline-flex items-center justify-center text-evari-dim hover:text-evari-text"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Account — username + admin URL, never a password */}
      {node.account && (
        <div className="px-5 py-4 border-t border-evari-edge">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-1">
                Account · {node.account.label}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    accountIdentifier ? 'bg-evari-success' : 'bg-evari-danger',
                  )}
                />
                {accountIdentifier ? (
                  <code className="text-[13px] text-evari-text font-mono truncate">
                    {accountIdentifier}
                  </code>
                ) : (
                  <span className="text-[13px] italic text-evari-dimmer">
                    {node.account.identifierPlaceholder ?? 'not set'}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-evari-dimmer mt-1">
                No password stored here — click through and log in as
                normal. We only hold the username.
              </div>
            </div>
            {accountUrl && accountIdentifier && (
              <a
                href={accountUrl}
                target="_blank"
                rel="noreferrer"
                className="h-9 px-3 rounded-md inline-flex items-center gap-1.5 bg-evari-gold text-evari-goldInk hover:brightness-110 text-[11px] uppercase tracking-[0.1em] font-medium"
              >
                Open {node.account.label.toLowerCase()}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Dashboard-specific breakdown — "what's in the app" */}
      {isDashboard && <DashboardBreakdown />}

      {/* Body — 4 column grid of what-we-get */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <DetailSection
          label="Managed in the Evari dashboard"
          items={node.manageHere}
        />
        <DetailSection
          label="Managed in the service itself"
          items={node.manageInService}
          muted
        />
        <DetailSection label="Business outcomes" items={node.outcomes} emphasis />
        <div className="px-5 py-4 bg-evari-surfaceSoft/40 border-t border-evari-edge">
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-2">
            Cost breakdown
          </div>
          <ul className="space-y-1.5">
            {node.costDetail.map((c, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="text-evari-text">{c.label}</div>
                  {c.note && (
                    <div className="text-evari-dimmer text-[10px] mt-0.5">
                      {c.note}
                    </div>
                  )}
                </div>
                <div className="font-mono tabular-nums text-evari-text shrink-0">
                  {c.amount === 0 ? '—' : `£${c.amount}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Env var editor — matches the Connections-page flow */}
      {node.envVars.length > 0 && (
        <div className="px-5 py-4 border-t border-evari-edge">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer">
              Credentials
            </div>
            <Link
              href="/connections"
              className="text-[10px] text-evari-dim hover:text-evari-text inline-flex items-center gap-1"
            >
              Full setup assistant
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
          <div className="space-y-2">
            {node.envVars.map((key) => (
              <EnvVarRow
                key={key}
                varName={key}
                present={envPresent.has(key)}
                onSaved={() => onEnvSaved(key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Related flows — full bidirectional detail per entry */}
      {relatedFlows.length > 0 && (
        <div className="px-5 py-4 border-t border-evari-edge">
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-3">
            Connections — full data flow
          </div>
          <div className="space-y-3">
            {relatedFlows.map((f, i) => {
              const live = flowIsLive(f);
              const fromN = WIREFRAME_NODES.find((n) => n.id === f.from);
              const toN = WIREFRAME_NODES.find((n) => n.id === f.to);
              if (!fromN || !toN) return null;
              const isTwoWay = f.toPayloads.length > 0;
              return (
                <div
                  key={i}
                  className="rounded-lg bg-evari-surfaceSoft/50 overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-evari-surfaceSoft/80">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full shrink-0',
                        live ? 'bg-evari-success' : 'bg-evari-danger',
                      )}
                      title={live ? 'Live — both ends connected' : 'Missing credentials on one or both ends'}
                    />
                    <span className="text-xs font-medium text-evari-text">
                      {fromN.label}
                    </span>
                    {isTwoWay ? (
                      <span className="text-evari-dimmer text-xs">⇄</span>
                    ) : (
                      <ArrowRight className="h-3 w-3 text-evari-dimmer" />
                    )}
                    <span className="text-xs font-medium text-evari-text">
                      {toN.label}
                    </span>
                    <span
                      className={cn(
                        'ml-auto text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded',
                        live
                          ? 'bg-evari-success/15 text-evari-success'
                          : 'bg-evari-danger/15 text-evari-danger',
                      )}
                    >
                      {live ? 'live' : 'not connected'}
                    </span>
                  </div>

                  {/* Summary */}
                  <p className="text-xs text-evari-dim leading-relaxed px-3 py-2 border-t border-evari-edge/50">
                    {f.summary}
                  </p>

                  {/* Bidirectional payloads */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-evari-edge/50">
                    <div className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
                        <span className="text-evari-dim">{fromN.label}</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                        <span className="text-evari-dim">{toN.label}</span>
                      </div>
                      <ul className="space-y-1">
                        {f.fromPayloads.map((p, j) => (
                          <li
                            key={j}
                            className="text-[11px] text-evari-dim leading-relaxed flex gap-1.5"
                          >
                            <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {f.toPayloads.length > 0 ? (
                      <div className="px-3 py-2.5 md:border-l border-evari-edge/50 bg-evari-surfaceSoft/20">
                        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
                          <span className="text-evari-dim">{toN.label}</span>
                          <ArrowLeft className="h-2.5 w-2.5" />
                          <span className="text-evari-dim">{fromN.label}</span>
                        </div>
                        <ul className="space-y-1">
                          {f.toPayloads.map((p, j) => (
                            <li
                              key={j}
                              className="text-[11px] text-evari-dim leading-relaxed flex gap-1.5"
                            >
                              <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 md:border-l border-evari-edge/50 bg-evari-surfaceSoft/20">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-evari-dimmer mb-1.5">
                          One-way
                        </div>
                        <p className="text-[11px] text-evari-dimmer italic leading-relaxed">
                          {toN.label} reads only — nothing flows back.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Capabilities (merged from Connections page) */}
      {node.capabilities && node.capabilities.length > 0 && (
        <div className="px-5 py-4 border-t border-evari-edge">
          <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-3">
            Capabilities / API scopes
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {node.capabilities.map((c, i) => (
              <div key={i} className="text-xs bg-evari-surfaceSoft/50 rounded-md px-3 py-2">
                <div className="font-mono text-evari-text text-[11px]">{c.name}</div>
                <div className="text-evari-dim text-[11px] mt-1 leading-relaxed">
                  {c.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes + Docs */}
      {(node.notes || node.docsUrl) && (
        <div className="px-5 py-4 border-t border-evari-edge bg-evari-surfaceSoft/20">
          {node.notes && (
            <p className="text-xs text-evari-dim leading-relaxed">
              <span className="text-evari-dimmer uppercase tracking-[0.14em] text-[9px] mr-2">
                Note
              </span>
              {node.notes}
            </p>
          )}
          {node.docsUrl && (
            <a
              href={node.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-evari-dim hover:text-evari-gold mt-2"
            >
              Official docs <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      )}

      {/* Per-service AI chat — the feature Craig asked for */}
      <NodeChat node={node} />
    </div>
  );
}

function DashboardBreakdown() {
  return (
    <div className="px-5 py-4 border-t border-evari-edge">
      <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-3">
        Everything inside the dashboard
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DASHBOARD_MAP.map((section) => (
          <div key={section.label}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-evari-gold mb-2">
              {section.label}
            </div>
            <ul className="space-y-1.5">
              {section.pages.map((p) => (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    className="block group rounded-md px-2 py-1.5 hover:bg-evari-surfaceSoft transition-colors"
                  >
                    <div className="text-xs text-evari-text group-hover:text-evari-gold flex items-center gap-1">
                      {p.label}
                      <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="text-[10px] text-evari-dim leading-snug mt-0.5">
                      {p.blurb}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Inline env var row -------------------------------------------------

function EnvVarRow({
  varName,
  present,
  onSaved,
}: {
  varName: string;
  present: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/env/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: varName, value }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (!data.ok) {
        setError(data.error ?? 'Failed to save');
      } else {
        setJustSaved(true);
        setEditing(false);
        setValue('');
        onSaved();
        setTimeout(() => setJustSaved(false), 4000);
      }
    } catch {
      setError('Network error — check dev server is running');
    } finally {
      setSaving(false);
    }
  }

  if (present && !editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md bg-evari-surfaceSoft/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Check className="h-3 w-3 text-evari-success shrink-0" />
          <code className="text-[11px] font-mono text-evari-dim truncate">{varName}</code>
          {justSaved && (
            <span className="text-[10px] text-evari-success">token added</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[10px] text-evari-dim hover:text-evari-text uppercase tracking-[0.1em]"
        >
          edit
        </button>
      </div>
    );
  }

  if (!present && !editing) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md bg-evari-surfaceSoft/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full bg-evari-warn shrink-0" />
          <code className="text-[11px] font-mono text-evari-dim truncate">{varName}</code>
          <span className="text-[10px] text-evari-dimmer">missing</span>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[10px] text-evari-gold hover:brightness-125 uppercase tracking-[0.1em] font-medium"
        >
          add token
        </button>
      </div>
    );
  }

  // Editing
  return (
    <div className="rounded-md bg-evari-surfaceSoft/60 px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <code className="text-[11px] font-mono text-evari-dim">{varName}</code>
      </div>
      <div className="flex items-center gap-2">
        <input
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="paste token..."
          className="flex-1 h-8 text-xs px-2 rounded bg-evari-surface border border-evari-edge text-evari-text font-mono placeholder:text-evari-dimmer focus:outline-none focus:border-evari-gold"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value) save();
            if (e.key === 'Escape') {
              setEditing(false);
              setValue('');
              setError(null);
            }
          }}
        />
        <button
          type="button"
          onClick={() => setReveal((v) => !v)}
          className="h-8 w-8 rounded inline-flex items-center justify-center text-evari-dim hover:text-evari-text hover:bg-evari-surface"
          title={reveal ? 'Hide' : 'Reveal'}
        >
          {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          disabled={!value || saving}
          onClick={save}
          className={cn(
            'h-8 px-3 rounded inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] font-medium',
            !value || saving
              ? 'bg-evari-surface text-evari-dimmer cursor-not-allowed'
              : 'bg-evari-gold text-evari-goldInk hover:brightness-110',
          )}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue('');
            setError(null);
          }}
          className="h-8 px-2 rounded text-[10px] uppercase tracking-[0.1em] text-evari-dim hover:text-evari-text"
        >
          Cancel
        </button>
      </div>
      {error && (
        <div className="text-[10px] text-evari-danger font-mono">{error}</div>
      )}
      <div className="text-[9px] text-evari-dimmer leading-snug">
        Saved to <code className="text-evari-dim">.env.local</code> — restart{' '}
        <code className="text-evari-dim">npm run dev</code> after saving for
        the dashboard to pick up the new value. Dev-only; in production use
        Vercel env vars.
      </div>
    </div>
  );
}

// --- Detail section helper --------------------------------------------

function DetailSection({
  label,
  items,
  muted,
  emphasis,
}: {
  label: string;
  items: string[];
  muted?: boolean;
  emphasis?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="px-5 py-4 border-t border-evari-edge">
        <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-2">
          {label}
        </div>
        <div className="text-xs text-evari-dimmer italic">None</div>
      </div>
    );
  }
  return (
    <div className={cn('px-5 py-4 border-t border-evari-edge', muted && 'bg-evari-surfaceSoft/20')}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-2">
        {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className={cn(
              'text-xs leading-relaxed flex gap-2',
              emphasis ? 'text-evari-text' : 'text-evari-dim',
            )}
          >
            <span
              className={cn(
                'shrink-0 mt-1.5 h-1 w-1 rounded-full',
                emphasis ? 'bg-evari-gold' : 'bg-evari-dimmer',
              )}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Flow detail --------------------------------------------------------

function FlowDetail({
  flow,
  fromNode,
  toNode,
  onClose,
}: {
  flow: WireframeFlow;
  fromNode: WireframeNode;
  toNode: WireframeNode;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl bg-evari-surface overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4 bg-evari-surfaceSoft">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-evari-text">
            {fromNode.label}
            {flow.toPayloads.length > 0 ? (
              <span className="text-evari-dimmer mx-1">⇄</span>
            ) : (
              <ArrowRight className="h-3 w-3 text-evari-dimmer mx-0.5" />
            )}
            {toNode.label}
          </div>
          <p className="text-sm text-evari-dim mt-2 leading-relaxed max-w-3xl">
            {flow.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-full hover:bg-evari-surface inline-flex items-center justify-center text-evari-dim hover:text-evari-text shrink-0"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        <PayloadColumn
          fromLabel={fromNode.label}
          toLabel={toNode.label}
          direction="forward"
          items={flow.fromPayloads}
        />
        {flow.toPayloads.length > 0 ? (
          <PayloadColumn
            fromLabel={toNode.label}
            toLabel={fromNode.label}
            direction="back"
            items={flow.toPayloads}
          />
        ) : (
          <div className="px-5 py-4 border-t border-evari-edge bg-evari-surfaceSoft/20">
            <div className="text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-2">
              Nothing flows back
            </div>
            <p className="text-xs text-evari-dimmer italic leading-relaxed">
              {toNode.label} is a data source only — the dashboard reads, it
              doesn&apos;t write. Useful because it reduces the blast radius
              of anything going wrong.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Per-service AI chat ------------------------------------------------

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function NodeChat({ node }: { node: WireframeNode }) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mock, setMock] = useState(false);

  // Reset conversation whenever the service changes
  useEffect(() => {
    setTurns([]);
    setInput('');
    setMock(false);
  }, [node.id]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...turns, { role: 'user' as const, content: text }];
    setTurns(next);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/wireframe/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nodeId: node.id,
          message: text,
          history: turns.slice(-6),
        }),
      });
      const data = (await res.json()) as { text: string; mock?: boolean };
      setMock(!!data.mock);
      setTurns([...next, { role: 'assistant', content: data.text }]);
    } catch {
      setTurns([
        ...next,
        {
          role: 'assistant',
          content:
            "Couldn't reach the chat endpoint. Make sure the dev server is running.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = [
    `How do I add tokens for ${node.label}?`,
    `What does ${node.label} cost at our scale?`,
    node.optional ? `Do I actually need ${node.label}?` : `What am I missing without ${node.label}?`,
  ];

  return (
    <div className="px-5 py-4 border-t border-evari-edge bg-evari-surfaceSoft/30">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-full bg-evari-gold flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-evari-goldInk" />
        </div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-evari-dim">
          Ask the AI about {node.label}
        </div>
        {mock && (
          <span className="text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-evari-surface text-evari-dimmer">
            fallback
          </span>
        )}
      </div>

      {/* Conversation */}
      {turns.length > 0 && (
        <div className="space-y-2 mb-3 max-h-[280px] overflow-y-auto">
          {turns.map((t, i) => (
            <div
              key={i}
              className={cn(
                'rounded-md px-3 py-2 text-xs leading-relaxed',
                t.role === 'user'
                  ? 'bg-evari-surface ml-8 text-evari-text'
                  : 'bg-evari-surface/60 mr-8 text-evari-dim',
              )}
            >
              {t.content}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-1 text-xs text-evari-dim mr-8 px-3 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-evari-gold animate-bounce" />
              <span
                className="h-1.5 w-1.5 rounded-full bg-evari-gold animate-bounce"
                style={{ animationDelay: '0.15s' }}
              />
              <span
                className="h-1.5 w-1.5 rounded-full bg-evari-gold animate-bounce"
                style={{ animationDelay: '0.3s' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Suggested starters (only when empty) */}
      {turns.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInput(s)}
              className="text-[10px] px-2 py-1 rounded-full bg-evari-surface text-evari-dim hover:text-evari-text hover:bg-evari-surfaceSoft transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Ask how to use ${node.label}…`}
          className="flex-1 h-9 text-xs px-3 rounded bg-evari-surface border border-evari-edge text-evari-text placeholder:text-evari-dimmer focus:outline-none focus:border-evari-gold"
          disabled={loading}
        />
        <button
          type="button"
          disabled={!input.trim() || loading}
          onClick={() => void send()}
          className={cn(
            'h-9 w-9 rounded inline-flex items-center justify-center',
            !input.trim() || loading
              ? 'bg-evari-surface text-evari-dimmer cursor-not-allowed'
              : 'bg-evari-gold text-evari-goldInk hover:brightness-110',
          )}
          title="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="text-[9px] text-evari-dimmer mt-2 leading-snug">
        Grounded in this service's role, env vars, costs, and connections.
        Ask about setup, costs, alternatives, or how it connects to other
        services.
      </div>
    </div>
  );
}

function PayloadColumn({
  fromLabel,
  toLabel,
  direction,
  items,
}: {
  fromLabel: string;
  toLabel: string;
  direction: 'forward' | 'back';
  items: string[];
}) {
  const Icon = direction === 'forward' ? ArrowRight : ArrowLeft;
  return (
    <div className="px-5 py-4 border-t border-evari-edge">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-evari-dimmer mb-3">
        <span className="text-evari-dim">{fromLabel}</span>
        <Icon className="h-3 w-3" />
        <span className="text-evari-dim">{toLabel}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-xs text-evari-dim leading-relaxed flex gap-2"
          >
            <span className="shrink-0 mt-1.5 h-1 w-1 rounded-full bg-evari-gold" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
