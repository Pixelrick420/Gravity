import {
  BYTES_PER_PARTICLE,
  CLEAR_COLOR,
  FLOATS_PER_PARTICLE,
  INSTANCE_BUFFER_GROWTH,
  INSTANCE_BUFFER_MIN_CAPACITY,
  WORLD_CENTER,
} from './constants';
import { FRAG_SRC, VERT_SRC } from './shaders';

const VERTICES_PER_QUAD = 6;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh) ?? ''}`);
  }
  return sh;
}

/** WebGL2 instanced-quad renderer. Draws straight from wasm memory. */
export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instanceBuf: WebGLBuffer;
  private uniHalf: WebGLUniformLocation;
  private uniCam: WebGLUniformLocation;
  private uniZoom: WebGLUniformLocation;
  private uniSize: WebGLUniformLocation;
  private capacity = 0;

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

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(prog) ?? ''}`);
    }
    this.program = prog;
    this.uniHalf = gl.getUniformLocation(prog, 'u_half')!;
    this.uniCam = gl.getUniformLocation(prog, 'u_camCenter')!;
    this.uniZoom = gl.getUniformLocation(prog, 'u_zoom')!;
    this.uniSize = gl.getUniformLocation(prog, 'u_size')!;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // interleaved instances [x,y,vx,vy,m]
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /** Grow the GPU buffer to hold `count` instances. */
  ensureCapacity(count: number) {
    if (count <= this.capacity) return;
    this.capacity = Math.max(INSTANCE_BUFFER_MIN_CAPACITY, count * INSTANCE_BUFFER_GROWTH);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuf);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.capacity * BYTES_PER_PARTICLE, this.gl.DYNAMIC_DRAW);
  }

  draw(view: Float32Array, count: number, zoomPxPerUnit: number, sizePx: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, view, 0, count * FLOATS_PER_PARTICLE);

    gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], CLEAR_COLOR[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniHalf, this.canvas.width / 2, this.canvas.height / 2);
    gl.uniform2f(this.uniCam, WORLD_CENTER.x, WORLD_CENTER.y);
    gl.uniform1f(this.uniZoom, zoomPxPerUnit);
    gl.uniform1f(this.uniSize, sizePx);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, VERTICES_PER_QUAD, count);
    gl.bindVertexArray(null);
  }
}
