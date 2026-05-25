// Box-projection vertex stage with per-face heightmap displacement.
//
// For each vertex, the 3 candidate height samples are picked from the same
// signed-axis box-projection scheme used in the fragment stage and blended
// triplanar-style. The blended height (centered at 0.5) drives a displacement
// along the object normal, giving the proxy organic relief from the photos.
//
// Texture coordinates for fragment shading are computed from the ORIGINAL
// (pre-displacement) position so the projected image stays parametrically
// locked to the proxy surface.

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

float faceHeight(bool present, sampler2D tex, vec2 uv) {
  if (!present) return 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.5;
  return texture2D(tex, uv).r;
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
