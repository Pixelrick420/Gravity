// Particle appearance constants, interpolated into the GLSL below.
const MASS_SIZE_FACTOR = 0.8;
const SPEED_TINT_RATE = 1.2;
const PARTICLE_BRIGHTNESS = 1.15;
const PARTICLE_ALPHA = 0.95;

export const VERT_SRC = `#version 300 es
precision highp float;

layout(location = 0) in vec2 i_world;
layout(location = 1) in vec2 i_vel;
layout(location = 2) in float i_mass;

uniform vec2 u_half;      // canvas half-size in px
uniform vec2 u_camCenter; // world coords at canvas center
uniform float u_zoom;     // px per world unit
uniform float u_size;     // base particle size in px

out vec2 v_vel;

void main() {
  const vec2 corners[6] = vec2[6](
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0)
  );
  vec2 c = corners[gl_VertexID];
  float sizePx = u_size * (1.0 + sqrt(max(i_mass, 0.0)) * ${MASS_SIZE_FACTOR.toFixed(1)});
  vec2 world = i_world + c * sizePx / u_zoom;
  gl_Position = vec4(
    ((world.x - u_camCenter.x) * u_zoom) / u_half.x,
    -((world.y - u_camCenter.y) * u_zoom) / u_half.y,
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
  // slow = blue, fast = gold; additive blending blooms overlaps
  float t = clamp(length(v_vel) * ${SPEED_TINT_RATE.toFixed(1)}, 0.0, 1.0);
  vec3 cool = vec3(0.55, 0.80, 1.00);
  vec3 warm = vec3(1.00, 0.75, 0.35);
  vec3 tint = mix(cool, warm, t);
  fragColor = vec4(tint * ${PARTICLE_BRIGHTNESS.toFixed(2)}, ${PARTICLE_ALPHA.toFixed(2)});
}
`;
