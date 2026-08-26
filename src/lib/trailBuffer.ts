import { CLEAR_COLOR } from './constants';
import { COPY_FRAG_SRC, FADE_FRAG_SRC, QUAD_VERT_SRC } from './shaders';
import { createProgram, type Program } from './glutil';

export class TrailBuffer {
  private gl: WebGL2RenderingContext;
  private fadeProg: Program;
  private copyProg: Program;
  private emptyVao: WebGLVertexArrayObject;
  private tex: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;
  width = 0;
  height = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.fadeProg = createProgram(gl, QUAD_VERT_SRC, FADE_FRAG_SRC, 'trail-fade');
    this.copyProg = createProgram(gl, QUAD_VERT_SRC, COPY_FRAG_SRC, 'trail-copy');
    this.emptyVao = gl.createVertexArray()!;
  }

  ensureSize(width: number, height: number) {
    if (this.tex && this.width === width && this.height === height) return;
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);

    gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], CLEAR_COLOR[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.width = width;
    this.height = height;
  }

  clear() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearColor(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], CLEAR_COLOR[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  fade(alpha: number) {
    const gl = this.gl;
    gl.useProgram(this.fadeProg.program);
    gl.uniform4f(this.fadeProg.u('u_color'), CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], alpha);
    this.drawQuad();
  }

  present() {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.useProgram(this.copyProg.program);
    gl.uniform1i(this.copyProg.u('u_tex'), 0);
    this.drawQuad();
  }

  get framebuffer(): WebGLFramebuffer {
    return this.fbo!;
  }

  private drawQuad() {
    this.gl.bindVertexArray(this.emptyVao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    this.gl.bindVertexArray(null);
  }
}
