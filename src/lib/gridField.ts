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

const GRID_LEVELS = 2;
const GRID_FINE_RATIO = 0.5;
const GRID_FINE_NEAR_RADIUS = 1.0;
const GRID_FINE_BEND_THRESHOLD = 0.25;

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

interface GridLevelData {
  spacing: number;
  cols: number;
  rows: number;
  originX: number;
  originY: number;
  displaced: Float32Array;
  mask: Uint8Array;
}

export class GridField {
  private hash = new SpatialHash(HASH_RADIUS);
  private nearby: number[] = [];
  readonly geometry: GridGeometry = { verts: new Float32Array(0), count: 0 };
  private levels: GridLevelData[] = [];
  private baseSpacing = GRID_SPACING;

  update(view: Float32Array, particleCount: number, halfW: number, halfH: number, camCenterX: number, camCenterY: number) {
    const baseSpacing = Math.max(
      GRID_SPACING,
      (2 * halfW) / GRID_MAX_CELLS,
      (2 * halfH) / GRID_MAX_CELLS,
    );
    this.baseSpacing = baseSpacing;

    const extW = halfW + GRID_VIEWPORT_MARGIN;
    const extH = halfH + GRID_VIEWPORT_MARGIN;
    const originX = camCenterX - extW;
    const originY = camCenterY - extH;

    this.hash.clear();
    for (let i = 0; i < particleCount; i++) {
      const o = i * FLOATS_PER_PARTICLE;
      this.hash.insert(i, view[o], view[o + 1]);
    }

    const ws = WORLD_SIZE;
    const eps2 = GRID_FIELD_EPS2;
    const nearRadius2 = GRID_FINE_NEAR_RADIUS * GRID_FINE_NEAR_RADIUS;

    this.levels.length = 0;

    for (let level = 0; level < GRID_LEVELS; level++) {
      const spacing = level === 0 ? baseSpacing : baseSpacing * Math.pow(GRID_FINE_RATIO, level);
      const cols = Math.max(2, Math.ceil((2 * extW) / spacing) + 1);
      const rows = Math.max(2, Math.ceil((2 * extH) / spacing) + 1);

      const displaced = new Float32Array(cols * rows * FLOATS_PER_GRID_VERTEX);
      const mask = new Uint8Array(cols * rows);

      for (let r = 0; r < rows; r++) {
        const vy = originY + r * spacing;
        for (let c = 0; c < cols; c++) {
          const vx = originX + c * spacing;
          const idx = r * cols + c;

          this.nearby.length = 0;
          this.hash.query(vx, vy, this.nearby);

          if (level > 0) {
            let near = false;
            for (let k = 0; k < this.nearby.length; k++) {
              const o = this.nearby[k] * FLOATS_PER_PARTICLE;
              let dx = view[o] - vx;
              let dy = view[o + 1] - vy;
              dx = dx - ws * Math.round(dx / ws);
              dy = dy - ws * Math.round(dy / ws);
              if (dx * dx + dy * dy < nearRadius2) {
                near = true;
                break;
              }
            }
            if (!near) continue;
          }

          let ax = 0;
          let ay = 0;
          let phi = 0;
          for (let k = 0; k < this.nearby.length; k++) {
            const o = this.nearby[k] * FLOATS_PER_PARTICLE;
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
          const norm = mag / GRID_BEND_MAX;
          if (level > 0 && norm < GRID_FINE_BEND_THRESHOLD) continue;

          mask[idx] = 1;
          const alen = Math.hypot(ax, ay);
          let ox = 0;
          let oy = 0;
          if (alen > 1e-9) {
            ox = (ax / alen) * mag;
            oy = (ay / alen) * mag;
          }
          const p = idx * FLOATS_PER_GRID_VERTEX;
          displaced[p] = vx + ox;
          displaced[p + 1] = vy + oy;
          displaced[p + 2] = norm;
        }
      }

      this.levels.push({ spacing, cols, rows, originX, originY, displaced, mask });
    }

    this.emitSegments();
  }

  private emitSegments() {
    let totalSegments = 0;
    for (const lev of this.levels) {
      const { cols, rows, mask } = lev;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (!mask[idx]) continue;
          if (c < cols - 1 && mask[idx + 1]) totalSegments++;
          if (r < rows - 1 && mask[idx + cols]) totalSegments++;
        }
      }
    }

    const floats = totalSegments * 2 * FLOATS_PER_GRID_VERTEX;
    if (this.geometry.verts.length < floats) {
      this.geometry.verts = new Float32Array(floats);
    }

    let w = 0;
    for (const lev of this.levels) {
      const { cols, rows, displaced, mask, originX, originY, spacing } = lev;

      const worldY = (r: number) => originY + r * spacing;
      const worldX = (c: number) => originX + c * spacing;
      const rowMajor = (r: number) => Math.round(worldY(r) / this.baseSpacing) % GRID_MAJOR_EVERY === 0;
      const colMajor = (c: number) => Math.round(worldX(c) / this.baseSpacing) % GRID_MAJOR_EVERY === 0;

      const intensity = (p: number, isMajor: boolean) => {
        const base = isMajor ? GRID_MAJOR_INTENSITY : 0;
        return base + (1 - base) * displaced[p + 2];
      };

      for (let r = 0; r < rows; r++) {
        const major = rowMajor(r);
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c;
          const b = a + 1;
          if (!mask[a] || !mask[b]) continue;
          const pa = a * FLOATS_PER_GRID_VERTEX;
          const pb = b * FLOATS_PER_GRID_VERTEX;
          this.geometry.verts[w++] = displaced[pa];
          this.geometry.verts[w++] = displaced[pa + 1];
          this.geometry.verts[w++] = intensity(pa, major);
          this.geometry.verts[w++] = displaced[pb];
          this.geometry.verts[w++] = displaced[pb + 1];
          this.geometry.verts[w++] = intensity(pb, major);
        }
      }

      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          const major = colMajor(c);
          const a = r * cols + c;
          const b = a + cols;
          if (!mask[a] || !mask[b]) continue;
          const pa = a * FLOATS_PER_GRID_VERTEX;
          const pb = b * FLOATS_PER_GRID_VERTEX;
          this.geometry.verts[w++] = displaced[pa];
          this.geometry.verts[w++] = displaced[pa + 1];
          this.geometry.verts[w++] = intensity(pa, major);
          this.geometry.verts[w++] = displaced[pb];
          this.geometry.verts[w++] = displaced[pb + 1];
          this.geometry.verts[w++] = intensity(pb, major);
        }
      }
    }

    this.geometry.count = w / FLOATS_PER_GRID_VERTEX;
  }
}
