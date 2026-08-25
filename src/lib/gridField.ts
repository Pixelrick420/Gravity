import {
  GRID_BEND_MAX,
  GRID_BEND_SCALE,
  GRID_FIELD_EPS2,
  GRID_MAJOR_EVERY,
  GRID_MAJOR_INTENSITY,
  GRID_MAX_CELLS,
  GRID_SPACING,
  GRID_VIEWPORT_MARGIN,
  WORLD_SIZE,
} from './constants';

export interface GridGeometry {
  verts: Float32Array;
  count: number;
}

const FLOATS_PER_PARTICLE = 5;
const FLOATS_PER_GRID_VERTEX = 3;
const HASH_RADIUS = 0.5;

class SpatialHash {
  private cellSize: number;
  private cells = new Map<number, number[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear() {
    this.cells.clear();
  }

  insert(index: number, x: number, y: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const key = cx * 73856093 ^ cy * 19349663;
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(index);
  }

  query(x: number, y: number, out: number[]) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = (cx + dx) * 73856093 ^ (cy + dy) * 19349663;
        const cell = this.cells.get(key);
        if (cell) {
          for (let i = 0; i < cell.length; i++) out.push(cell[i]);
        }
      }
    }
  }
}

export class GridField {
  private displaced = new Float32Array(0);
  private halfW = 0;
  private halfH = 0;
  private spacing = GRID_SPACING;
  private camCenterX = 0;
  private camCenterY = 0;
  private hash = new SpatialHash(HASH_RADIUS);
  private nearby: number[] = [];
  readonly geometry: GridGeometry = { verts: new Float32Array(0), count: 0 };
  cols = 0;
  rows = 0;

  update(view: Float32Array, particleCount: number, halfW: number, halfH: number, camCenterX: number, camCenterY: number) {
    const spacing = Math.max(
      GRID_SPACING,
      (2 * halfW) / GRID_MAX_CELLS,
      (2 * halfH) / GRID_MAX_CELLS,
    );
    this.spacing = spacing;
    this.halfW = halfW;
    this.halfH = halfH;
    this.camCenterX = camCenterX;
    this.camCenterY = camCenterY;
    const extW = halfW + GRID_VIEWPORT_MARGIN;
    const extH = halfH + GRID_VIEWPORT_MARGIN;
    this.cols = Math.max(2, Math.ceil((2 * extW) / spacing) + 1);
    this.rows = Math.max(2, Math.ceil((2 * extH) / spacing) + 1);
    const n = this.cols * this.rows;
    if (this.displaced.length < n * FLOATS_PER_GRID_VERTEX) {
      this.displaced = new Float32Array(n * FLOATS_PER_GRID_VERTEX);
    }

    this.hash.clear();
    for (let i = 0; i < particleCount; i++) {
      const o = i * FLOATS_PER_PARTICLE;
      this.hash.insert(i, view[o], view[o + 1]);
    }

    const eps2 = GRID_FIELD_EPS2;
    const d = this.displaced;
    const out = this.nearby;
    const ws = WORLD_SIZE;
    for (let r = 0; r < this.rows; r++) {
      const vy = camCenterY - extH + r * spacing;
      for (let c = 0; c < this.cols; c++) {
        const vx = camCenterX - extW + c * spacing;
        out.length = 0;
        this.hash.query(vx, vy, out);
        let ax = 0;
        let ay = 0;
        let phi = 0;
        for (let k = 0; k < out.length; k++) {
          const o = out[k] * FLOATS_PER_PARTICLE;
          let dx = view[o] - vx;
          let dy = view[o + 1] - vy;
          dx = dx - ws * Math.round(dx / ws);
          dy = dy - ws * Math.round(dy / ws);
          const r2 = dx * dx + dy * dy;
          ax += (dx * view[o + 4]) / (r2 + eps2);
          ay += (dy * view[o + 4]) / (r2 + eps2);
          phi += view[o + 4] / Math.sqrt(r2 + eps2);
        }
        const mag = GRID_BEND_MAX * Math.tanh(phi * GRID_BEND_SCALE);
        const alen = Math.hypot(ax, ay);
        let ox = 0;
        let oy = 0;
        if (alen > 1e-9) {
          ox = (ax / alen) * mag;
          oy = (ay / alen) * mag;
        }
        const p = (r * this.cols + c) * FLOATS_PER_GRID_VERTEX;
        d[p] = vx + ox;
        d[p + 1] = vy + oy;
        d[p + 2] = mag / GRID_BEND_MAX;
      }
    }
    this.emitSegments();
  }

  private emitSegments() {
    const { cols, rows } = this;
    const segments = 2 * ((cols - 1) * rows + cols * (rows - 1));
    const floats = segments * 2 * FLOATS_PER_GRID_VERTEX;
    if (this.geometry.verts.length < floats) {
      this.geometry.verts = new Float32Array(floats);
    }
    const out = this.geometry.verts;
    const pts = this.displaced;
    let w = 0;
    const intensity = (p: number, isMajor: boolean) => {
      const base = isMajor ? GRID_MAJOR_INTENSITY : 0;
      return base + (1 - base) * pts[p + 2];
    };
    const worldY = (r: number) => this.camCenterY - this.halfH - GRID_VIEWPORT_MARGIN + r * this.spacing;
    const worldX = (c: number) => this.camCenterX - this.halfW - GRID_VIEWPORT_MARGIN + c * this.spacing;
    const rowMajor = (r: number) => Math.round(worldY(r) / this.spacing) % GRID_MAJOR_EVERY === 0;
    const colMajor = (c: number) => Math.round(worldX(c) / this.spacing) % GRID_MAJOR_EVERY === 0;
    for (let r = 0; r < rows; r++) {
      const major = rowMajor(r);
      for (let c = 0; c < cols - 1; c++) {
        const a = (r * cols + c) * FLOATS_PER_GRID_VERTEX;
        out[w++] = pts[a];
        out[w++] = pts[a + 1];
        out[w++] = intensity(a, major);
        const b = a + FLOATS_PER_GRID_VERTEX;
        out[w++] = pts[b];
        out[w++] = pts[b + 1];
        out[w++] = intensity(b, major);
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const major = colMajor(c);
        const a = (r * cols + c) * FLOATS_PER_GRID_VERTEX;
        out[w++] = pts[a];
        out[w++] = pts[a + 1];
        out[w++] = intensity(a, major);
        const b = ((r + 1) * cols + c) * FLOATS_PER_GRID_VERTEX;
        out[w++] = pts[b];
        out[w++] = pts[b + 1];
        out[w++] = intensity(b, major);
      }
    }
    this.geometry.count = segments * 2;
  }
}
