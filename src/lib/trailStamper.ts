import { FRAG_SRC, TRAIL_VERT_SRC } from './shaders';
import { createProgram, type Program } from './glutil';

const FLOATS_PER_SEGMENT = 6;

export class TrailStamper {
  private gl: WebGL2RenderingContext;
  private prog: Program;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private capacity = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = createProgram(gl, TRAIL_VERT_SRC, FRAG_SRC, 'trail-stamper');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const stride = FLOATS_PER_SEGMENT * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(0, 1);
    gl.vertexAttribDivisor(1, 1);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  draw(verts: Float32Array, count: number, zoomPxPerUnit: number, halfW: number, halfH: number, camCenterX: number, camCenterY: number, worldSize: number) {
    const gl = this.gl;
    if (count > this.capacity) {
      this.capacity = Math.ceil(count * 1.5);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, this.capacity * FLOATS_PER_SEGMENT * 4, gl.DYNAMIC_DRAW);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts, 0, count * FLOATS_PER_SEGMENT);

    gl.useProgram(this.prog.program);
    gl.uniform2f(this.prog.u('u_half'), halfW, halfH);
    gl.uniform2f(this.prog.u('u_camCenter'), camCenterX, camCenterY);
    gl.uniform1f(this.prog.u('u_zoom'), zoomPxPerUnit);
    gl.uniform1f(this.prog.u('u_worldSize'), worldSize);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.LINES, 0, 2, count);
    gl.bindVertexArray(null);
  }
}
