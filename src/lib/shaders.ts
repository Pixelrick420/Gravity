const SPEED_TINT_RATE = 0.03;
const PARTICLE_BRIGHTNESS = 1.15;
const PARTICLE_ALPHA = 0.95;

export const VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 i_world;
layout(location = 1) in vec2 i_vel;

uniform vec2 u_half;
uniform vec2 u_camCenter;
uniform float u_zoom;
uniform float u_size;
uniform float u_worldSize;

out vec2 v_vel;

void main() {
  vec2 c;
  if (gl_VertexID == 0) c = vec2(-1.0, -1.0);
  else if (gl_VertexID == 1) c = vec2(1.0, -1.0);
  else if (gl_VertexID == 2) c = vec2(-1.0, 1.0);
  else if (gl_VertexID == 3) c = vec2(-1.0, 1.0);
  else if (gl_VertexID == 4) c = vec2(1.0, -1.0);
  else c = vec2(1.0, 1.0);
  float sizePx = u_size;
  vec2 off = i_world - u_camCenter;
  off.x = off.x - u_worldSize * round(off.x / u_worldSize);
  off.y = off.y - u_worldSize * round(off.y / u_worldSize);
  gl_Position = vec4(
    (off.x * u_zoom + c.x * sizePx) / u_half.x,
    -(off.y * u_zoom + c.y * sizePx) / u_half.y,
    0.0,
    1.0
  );
  v_vel = i_vel;
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;

in vec2 v_vel;
out vec4 fragColor;

void main() {
  float t = clamp(length(v_vel) * ${SPEED_TINT_RATE.toFixed(3)}, 0.0, 1.0);
  vec3 cool = vec3(0.55, 0.80, 1.00);
  vec3 warm = vec3(1.00, 0.75, 0.35);
  vec3 tint = mix(cool, warm, t);
  fragColor = vec4(tint * ${PARTICLE_BRIGHTNESS.toFixed(2)}, ${PARTICLE_ALPHA.toFixed(2)});
}
`;

export const TRAIL_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 i_prev;
layout(location = 1) in vec2 i_pos;
layout(location = 2) in vec2 i_vel;

uniform vec2 u_half;
uniform vec2 u_camCenter;
uniform float u_zoom;
uniform float u_worldSize;

out vec2 v_vel;

void main() {
  vec2 world = gl_VertexID == 0 ? i_prev : i_pos;
  vec2 off = world - u_camCenter;
  off.x = off.x - u_worldSize * round(off.x / u_worldSize);
  off.y = off.y - u_worldSize * round(off.y / u_worldSize);
  gl_Position = vec4(
    (off.x * u_zoom) / u_half.x,
    -(off.y * u_zoom) / u_half.y,
    0.0,
    1.0
  );
  v_vel = i_vel;
}
`;

export const GRID_VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 i_world;
layout(location = 1) in float i_intensity;

uniform vec2 u_half;
uniform vec2 u_camCenter;
uniform float u_zoom;

out float v_intensity;

void main() {
  gl_Position = vec4(
    ((i_world.x - u_camCenter.x) * u_zoom) / u_half.x,
    -((i_world.y - u_camCenter.y) * u_zoom) / u_half.y,
    0.0,
    1.0
  );
  v_intensity = i_intensity;
}
`;

export const GRID_FRAG_SRC = `#version 300 es
precision highp float;

uniform vec4 u_dimColor;
uniform vec4 u_brightColor;

in float v_intensity;
out vec4 fragColor;

void main() {
  fragColor = mix(u_dimColor, u_brightColor, clamp(v_intensity, 0.0, 1.0));
}
`;

export const QUAD_VERT_SRC = `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
  vec2 c;
  if (gl_VertexID == 0) c = vec2(-1.0, -1.0);
  else if (gl_VertexID == 1) c = vec2(1.0, -1.0);
  else if (gl_VertexID == 2) c = vec2(-1.0, 1.0);
  else if (gl_VertexID == 3) c = vec2(-1.0, 1.0);
  else if (gl_VertexID == 4) c = vec2(1.0, -1.0);
  else c = vec2(1.0, 1.0);
  v_uv = c * 0.5 + 0.5;
  gl_Position = vec4(c, 0.0, 1.0);
}
`;

export const FADE_FRAG_SRC = `#version 300 es
precision highp float;

uniform vec4 u_color;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;

export const COPY_FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 fragColor;

void main() {
  fragColor = texture(u_tex, v_uv);
}
`;
