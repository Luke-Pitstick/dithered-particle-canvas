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
  outColor = texture(u_texture, vec2(v_uv.x, 1.0 - v_uv.y));
}
`;

export const REVEAL_COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

const int MAX_TRAIL_POINTS = 32;
const float DUST_FLICKER_SEED_SCALE = 17.17;
const float DUST_FLICKER_STEP_MS = 80.0;
const float EDGE_FLICKER_SEED_SCALE = 23.37;
const float EDGE_FLICKER_STEP_MS = 90.0;
const float EDGE_NOISE_CELL_SIZE = 18.0;
const float EDGE_NOISE_MAX_WIDTH_MULTIPLIER = 0.7;

uniform sampler2D u_background;
uniform sampler2D u_foreground;
uniform vec2 u_pointer;
uniform float u_pointerActive;
uniform float u_pointerFade;
uniform float u_radius;
uniform float u_softness;
uniform float u_strength;
uniform float u_time;
uniform float u_edgeDither;
uniform float u_edgeFlicker;
uniform float u_edgeNoise;
uniform float u_foregroundBlend;
uniform float u_revealPixelSize;
uniform int u_revealLayer;
uniform int u_trailCount;
uniform float u_trailDustFlicker;
uniform float u_trailDustSize;
uniform vec4 u_trailPoints[MAX_TRAIL_POINTS];
uniform float u_trailStrength;

in vec2 v_uv;
out vec4 outColor;

float bayer4(vec2 pixel, float pixelSize) {
  vec2 cell = floor(pixel / max(1.0, pixelSize));
  int x = int(mod(cell.x, 4.0));
  int y = int(mod(cell.y, 4.0));
  int index = y * 4 + x;
  float values[16] = float[16](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );

  return (values[index] + 0.5) / 16.0;
}

float dustThreshold(vec2 pixel, float seed, float cellSize) {
  vec2 cell = floor(pixel / max(1.0, cellSize));
  return fract(sin(dot(cell, vec2(12.9898, 78.233)) + seed * 0.037719) * 43758.5453);
}

float edgeDitherThreshold(vec2 pixel, float pixelSize, float seed) {
  return seed >= 0.0 ? dustThreshold(pixel, seed, pixelSize) : bayer4(pixel, pixelSize);
}

float edgeNoise(vec2 pixel, vec2 point, float pixelSize) {
  float cellSize = pixelSize > 1.0 ? pixelSize : EDGE_NOISE_CELL_SIZE;
  vec2 cell = floor(vec2(pixel.x - point.x, point.y - pixel.y) / cellSize);
  return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 sourceOver(vec4 destination, vec4 source) {
  float alpha = source.a + destination.a * (1.0 - source.a);

  if (alpha <= 0.0) {
    return vec4(0.0);
  }

  vec3 rgb = (source.rgb * source.a + destination.rgb * destination.a * (1.0 - source.a)) / alpha;
  return vec4(rgb, alpha);
}

float revealMask(vec2 pixel, vec2 point, float fade) {
  float revealPixelSize = max(1.0, u_revealPixelSize);
  vec2 samplePixel = revealPixelSize <= 1.0
    ? pixel
    : floor(pixel / revealPixelSize) * revealPixelSize + revealPixelSize * 0.5;
  float distanceToPointer = distance(samplePixel, point);
  float softStart = u_radius * (1.0 - clamp(u_softness, 0.0, 1.0));
  float edgeWidth = u_radius - softStart;
  float outerRadius = u_radius;

  if (u_edgeNoise > 0.0 && edgeWidth > 0.0 && distanceToPointer > softStart) {
    outerRadius +=
      (edgeNoise(samplePixel, point, revealPixelSize) - 0.5) *
      edgeWidth *
      EDGE_NOISE_MAX_WIDTH_MULTIPLIER *
      clamp(u_edgeNoise, 0.0, 1.0);
  }

  float mask = 0.0;

  if (distanceToPointer <= softStart) {
    mask = 1.0;
  } else if (distanceToPointer < outerRadius) {
    mask = 1.0 - smoothstep(softStart, outerRadius, distanceToPointer);
  }

  if (mask > 0.0 && u_edgeDither > 0.0) {
    float edgeAmount = 1.0 - mask;
    float edgeFlicker = clamp(u_edgeFlicker, 0.0, 1.0);
    float edgeSeed = edgeFlicker > 0.0
      ? (
        floor(point.x / revealPixelSize) * 0.73 +
        floor(point.y / revealPixelSize) * 0.41 +
        floor(max(u_time, 0.0) / EDGE_FLICKER_STEP_MS) * EDGE_FLICKER_SEED_SCALE
      ) * edgeFlicker
      : -1.0;
    mask = edgeDitherThreshold(pixel, revealPixelSize, edgeSeed) < edgeAmount * clamp(u_edgeDither, 0.0, 1.0) ? 0.0 : mask;
  }

  return mask * clamp(u_strength, 0.0, 1.0) * clamp(fade, 0.0, 1.0);
}

void main() {
  vec4 background = texture(u_background, v_uv);
  vec4 foreground = texture(u_foreground, v_uv);
  vec4 base = sourceOver(background, foreground);

  if ((u_pointerActive < 0.5 && u_trailCount == 0) || u_radius <= 0.0) {
    outColor = base;
    return;
  }

  vec2 pixel = gl_FragCoord.xy;
  float mask = 0.0;

  if (u_pointerActive >= 0.5) {
    mask = revealMask(pixel, u_pointer, u_pointerFade);
  }

  float dustSeedOffset =
    floor(max(u_time, 0.0) / DUST_FLICKER_STEP_MS) *
    DUST_FLICKER_SEED_SCALE *
    clamp(u_trailDustFlicker, 0.0, 1.0);

  for (int i = 0; i < MAX_TRAIL_POINTS; i += 1) {
    if (i >= u_trailCount) {
      break;
    }

    vec4 point = u_trailPoints[i];

    if (dustThreshold(pixel, point.w + dustSeedOffset, u_trailDustSize) <= clamp(point.z, 0.0, 1.0)) {
      mask = max(mask, revealMask(pixel, point.xy, u_trailStrength));
    }
  }

  vec4 revealSource = u_revealLayer == 0 ? background : foreground;
  float foregroundBlendMask = u_revealLayer == 0
    ? 1.0 - foreground.a * (1.0 - clamp(u_foregroundBlend, 0.0, 1.0))
    : 1.0;
  outColor = mix(base, revealSource, mask * foregroundBlendMask);
}
`;
