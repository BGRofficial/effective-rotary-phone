// Box-projection vertex stage with per-face heightmap displacement.
//
// Each vertex picks the 3 candidate height samples via the same signed-axis
// box-projection scheme as the fragment stage and blends triplanar-style.
// The blended height (centered at 0.5) drives a displacement along the
// object normal, giving the proxy organic relief from the scanned photos.
//
// Texture coordinates for fragment shading are computed from the ORIGINAL
// (pre-displacement) position so the projected image stays parametrically
// locked to the proxy surface.
//
// To prevent per-vertex spikes from heightmap noise, each face sample is a
// 5x5 mask-aware Gaussian over the heightmap. The mask awareness uses the
// alpha channel (silhouette) as a per-sample weight, so the neutral 0.5
// background never bleeds into the object's depth values at the silhouette
// edge. `uHeightSmoothness` is the radius in UV units; setting it below a
// small epsilon falls back to a single-tap sample for raw detail.

varying vec3 vObjectPos;
varying vec3 vObjectNormal;
varying vec3 vViewNormal;

uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform float uBlendSharpness;

uniform sampler2D uHeightFront;
uniform sampler2D uHeightBack;
uniform sampler2D uHeightLeft;
uniform sampler2D uHeightRight;
uniform sampler2D uHeightTop;
uniform sampler2D uHeightBottom;

uniform bool uHasHeightFront;
uniform bool uHasHeightBack;
uniform bool uHasHeightLeft;
uniform bool uHasHeightRight;
uniform bool uHasHeightTop;
uniform bool uHasHeightBottom;

uniform float uHeightStrength;
uniform float uHeightSmoothness;

float faceHeight(bool present, sampler2D tex, vec2 uv) {
  if (!present) return 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.5;

  if (uHeightSmoothness < 0.0005) {
    return texture2D(tex, uv).r;
  }

  float total = 0.0;
  float weight = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      vec2 off = vec2(float(dx), float(dy)) * uHeightSmoothness;
      vec2 suv = clamp(uv + off, 0.0, 1.0);
      vec4 s = texture2D(tex, suv);
      float r2 = float(dx * dx + dy * dy);
      float g = exp(-r2 * 0.5);
      // Multiply by silhouette alpha so neutral-background samples don't
      // pull masked-object depth values toward 0.5 at the silhouette edge.
      float w = g * s.a;
      total += s.r * w;
      weight += w;
    }
  }
  return weight > 0.01 ? total / weight : 0.5;
}

void main() {
  vec3 n = normalize(normal);
  vec3 span = max(uBoundsMax - uBoundsMin, vec3(1e-4));
  vec3 p = clamp((position - uBoundsMin) / span, 0.0, 1.0);

  vec3 blend = pow(abs(n), vec3(uBlendSharpness));
  blend /= max(blend.x + blend.y + blend.z, 1e-4);

  vec2 uvX = vec2(p.z, p.y);
  vec2 uvY = vec2(p.x, p.z);
  vec2 uvZ = vec2(p.x, p.y);

  float hx = n.x >= 0.0
    ? faceHeight(uHasHeightRight, uHeightRight, uvX)
    : faceHeight(uHasHeightLeft, uHeightLeft, vec2(1.0 - uvX.x, uvX.y));
  float hy = n.y >= 0.0
    ? faceHeight(uHasHeightTop, uHeightTop, uvY)
    : faceHeight(uHasHeightBottom, uHeightBottom, vec2(uvY.x, 1.0 - uvY.y));
  float hz = n.z >= 0.0
    ? faceHeight(uHasHeightFront, uHeightFront, uvZ)
    : faceHeight(uHasHeightBack, uHeightBack, vec2(1.0 - uvZ.x, uvZ.y));

  float blended = hx * blend.x + hy * blend.y + hz * blend.z;
  float displacement = (blended - 0.5) * uHeightStrength;
  vec3 displaced = position + n * displacement;

  vObjectPos = position;
  vObjectNormal = n;
  vViewNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
