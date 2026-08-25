import { GRID_COLOR_BRIGHT, GRID_COLOR_DIM, WORLD_CENTER } from './constants';
import { GRID_FRAG_SRC, GRID_VERT_SRC } from './shaders';
import { createProgram, type Program } from './glutil';

const FLOATS_PER_VERTEX = 3;

export class LineLayer {
  private gl: WebGL2RenderingContext;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private capacity = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, GRID_VERT_SRC, GRID_FRAG_SRC);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);
  }

  draw(
    verts: Float32Array,
    count: number,
    zoomPxPerUnit: number,
    halfW: number,
    halfH: number,
  ) {
    const gl = this.gl;
    if (count > this.capacity) {
      this.capacity = Math.ceil(count * 1.5);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity * FLOATS_PER_VERTEX * 4, gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts, 0, count * FLOATS_PER_VERTEX);

    gl.useProgram(this.prog.program);
    gl.uniform2f(this.prog.u('u_half'), halfW, halfH);
    gl.uniform2f(this.prog.u('u_camCenter'), WORLD_CENTER.x, WORLD_CENTER.y);
    gl.uniform1f(this.prog.u('u_zoom'), zoomPxPerUnit);
    gl.uniform4f(this.prog.u('u_dimColor'), ...GRID_COLOR_DIM);
    gl.uniform4f(this.prog.u('u_brightColor'), ...GRID_COLOR_BRIGHT);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.LINES, 0, count);
    gl.bindVertexArray(null);
  }
}
