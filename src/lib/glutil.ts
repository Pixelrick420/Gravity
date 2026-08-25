export interface Program {
  program: WebGLProgram;
  u: (name: string) => WebGLUniformLocation;
}

export function createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string): Program {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(`shader compile failed: ${gl.getShaderInfoLog(sh) ?? ''}`);
    }
    return sh;
  };

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(prog) ?? ''}`);
  }

  const cache = new Map<string, WebGLUniformLocation>();
  return {
    program: prog,
    u: (name) => {
      let loc = cache.get(name);
      if (loc === undefined) {
        loc = gl.getUniformLocation(prog, name)!;
        cache.set(name, loc);
      }
      return loc;
    },
  };
}
