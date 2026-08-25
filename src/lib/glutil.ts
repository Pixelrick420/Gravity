export interface Program {
  program: WebGLProgram;
  u: (name: string) => WebGLUniformLocation;
}

export function createProgram(gl: WebGL2RenderingContext, vertSrc: string, fragSrc: string, label = 'program'): Program {
  const compile = (type: number, src: string): WebGLShader => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) ?? '';
      const typeStr = type === gl.VERTEX_SHADER ? 'VERTEX' : 'FRAGMENT';
      const lines = src.split('\n');
      console.error(`[${label}] ${typeStr} shader compile failed:\n${log}`);
      console.error(`[${label}] Full ${typeStr} source:`);
      lines.forEach((line, i) => console.error(`  ${String(i + 1).padStart(3)}: ${line}`));
      throw new Error(`shader compile failed: ${log}`);
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
