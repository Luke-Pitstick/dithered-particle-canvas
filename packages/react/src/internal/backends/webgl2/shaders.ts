export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const COPY_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform sampler2D u_texture;
in vec2 v_uv;
out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv);
}
`;

export const REVEAL_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

uniform sampler2D u_background;
uniform sampler2D u_foreground;
uniform vec2 u_pointer;
uniform float u_pointerActive;
uniform float u_pointerFade;
uniform float u_radius;
uniform float u_softness;
uniform float u_strength;
uniform float u_edgeDither;
uniform int u_revealLayer;

in vec2 v_uv;
out vec4 outColor;

float bayer4(vec2 pixel) {
  int x = int(mod(pixel.x, 4.0));
  int y = int(mod(pixel.y, 4.0));
  int index = y * 4 + x;
  float values[16] = float[16](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );

  return (values[index] + 0.5) / 16.0;
}

vec4 sourceOver(vec4 destination, vec4 source) {
  float alpha = source.a + destination.a * (1.0 - source.a);

  if (alpha <= 0.0) {
    return vec4(0.0);
  }

  vec3 rgb = (source.rgb * source.a + destination.rgb * destination.a * (1.0 - source.a)) / alpha;
  return vec4(rgb, alpha);
}

void main() {
  vec4 background = texture(u_background, v_uv);
  vec4 foreground = texture(u_foreground, v_uv);
  vec4 base = sourceOver(background, foreground);

  if (u_pointerActive < 0.5 || u_radius <= 0.0) {
    outColor = base;
    return;
  }

  vec2 pixel = gl_FragCoord.xy;
  float distanceToPointer = distance(pixel, u_pointer);
  float softStart = u_radius * (1.0 - clamp(u_softness, 0.0, 1.0));
  float mask = 0.0;

  if (distanceToPointer <= softStart) {
    mask = 1.0;
  } else if (distanceToPointer < u_radius) {
    mask = 1.0 - (distanceToPointer - softStart) / max(1.0, u_radius - softStart);
  }

  if (mask > 0.0 && u_edgeDither > 0.0) {
    float edgeAmount = 1.0 - mask;
    mask = bayer4(pixel) < edgeAmount * clamp(u_edgeDither, 0.0, 1.0) ? 0.0 : mask;
  }

  mask *= clamp(u_strength, 0.0, 1.0) * clamp(u_pointerFade, 0.0, 1.0);

  vec4 revealSource = u_revealLayer == 0 ? background : foreground;
  outColor = mix(base, revealSource, mask);
}
`;
