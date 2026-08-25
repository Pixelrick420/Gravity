import {
  BYTES_PER_PARTICLE,
  CLEAR_COLOR,
  FLOATS_PER_PARTICLE,
  INSTANCE_BUFFER_GROWTH,
  INSTANCE_BUFFER_MIN_CAPACITY,
  trailFadeAlpha,
} from './constants';
import { FRAG_SRC, VERT_SRC } from './shaders';
import { createProgram } from './glutil';
import { LineLayer } from './lineLayer';
import type { GridGeometry } from './gridField';
import { TrailBuffer } from './trailBuffer';
import { TrailStamper } from './trailStamper';

const VERTICES_PER_QUAD = 6;

export interface TrailSegments {
  verts: Float32Array;
  count: number;
}

export interface DrawOptions {
  zoomPxPerUnit: number;
  sizePx: number;
  showGrid: boolean;
  showTrails: boolean;
  simDeltaMs: number;
  grid: GridGeometry | null;
  trailSegs: TrailSegments | null;
  camCenterX: number;
  camCenterY: number;
  worldSize: number;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog!: ReturnType<typeof createProgram>;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: WebGLBuffer;
  private capacity = 0;
  private trail: TrailBuffer;
  private gridLayer: LineLayer;
  private trailStamper: TrailStamper;
  private trailsOn = false;

  readonly canvas: OffscreenCanvas;

  constructor(canvas: OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.canvas = canvas;
    this.gl = gl;

    this.prog = createProgram(gl, VERT_SRC, FRAG_SRC, 'particles');

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.instanceBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    const stride = BYTES_PER_PARTICLE;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(0, 1);
    gl.vertexAttribDivisor(1, 1);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    this.trail = new TrailBuffer(gl);
    this.gridLayer = new LineLayer(gl);
    this.trailStamper = new TrailStamper(gl);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  ensureCapacity(count: number) {
    if (count <= this.capacity) return;
    this.capacity = Math.max(INSTANCE_BUFFER_MIN_CAPACITY, count * INSTANCE_BUFFER_GROWTH);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.capacity * BYTES_PER_PARTICLE, this.gl.DYNAMIC_DRAW);
  }

  draw(view: Float32Array, count: number, opts: DrawOptions) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, view, 0, count * FLOATS_PER_PARTICLE);

    const w = this.canvas.width;
    const h = this.canvas.height;

    if (opts.showTrails) {
      this.trail.ensureSize(w, h);
      if (!this.trailsOn) this.trail.clear();
      this.trailsOn = true;

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.trail.framebuffer);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.trail.fade(trailFadeAlpha(opts.simDeltaMs));
      if (opts.trailSegs && opts.trailSegs.count > 0) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        this.trailStamper.draw(
          opts.trailSegs.verts,
          opts.trailSegs.count,
          opts.zoomPxPerUnit,
          w / 2,
          h / 2,
          opts.camCenterX,
          opts.camCenterY,
          opts.worldSize,
        );
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.disable(gl.BLEND);
      this.trail.present();
    } else {
      this.trailsOn = false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], CLEAR_COLOR[3]);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (opts.showGrid && opts.grid && opts.grid.count > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.gridLayer.draw(
        opts.grid.verts,
        opts.grid.count,
        opts.zoomPxPerUnit,
        w / 2,
        h / 2,
        opts.camCenterX,
        opts.camCenterY,
      );
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    this.drawParticles(count, opts);
  }

  private drawParticles(count: number, opts: DrawOptions) {
    const gl = this.gl;
    gl.useProgram(this.prog.program);
    gl.uniform2f(this.prog.u('u_half'), this.canvas.width / 2, this.canvas.height / 2);
    gl.uniform2f(this.prog.u('u_camCenter'), opts.camCenterX, opts.camCenterY);
    gl.uniform1f(this.prog.u('u_zoom'), opts.zoomPxPerUnit);
    gl.uniform1f(this.prog.u('u_size'), opts.sizePx);
    gl.uniform1f(this.prog.u('u_worldSize'), opts.worldSize);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTICES_PER_QUAD, count);
    gl.bindVertexArray(null);
  }
}
