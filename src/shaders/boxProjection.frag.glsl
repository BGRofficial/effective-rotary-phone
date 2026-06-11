// Box-projection fragment stage.
//
// Each of the 6 uploaded face images is projected orthographically along its
// world axis. The dominant axis is chosen per-pixel from the object normal,
// and the three candidate axes are blended (triplanar-style) to soften seams.
//
// Faces with no uploaded image, and the transparent (background) regions of a
// silhouette mask, fall back to a flat Zen-gray shade so the proxy is always
// readable — including before any upload and during partial uploads.

varying vec3 vObjectPos;
varying vec3 vObjectNormal;
varying vec3 vViewNormal;

uniform sampler2D uTexFront;
uniform sampler2D uTexBack;
uniform sampler2D uTexLeft;
uniform sampler2D uTexRight;
uniform sampler2D uTexTop;
uniform sampler2D uTexBottom;

uniform bool uHasFront;
uniform bool uHasBack;
uniform bool uHasLeft;
uniform bool uHasRight;
uniform bool uHasTop;
uniform bool uHasBottom;

uniform vec3 uBoundsMin;
uniform vec3 uBoundsMax;
uniform float uBlendSharpness;
uniform vec3 uBaseColor;

// Sample a face texture, returning vec4(0) when absent or off-image.
vec4 faceSample(bool present, sampler2D tex, vec2 uv) {
  if (!present) return vec4(0.0);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(tex, uv);
}

void main() {
  // Object-space position normalized to [0,1] per axis.
  vec3 span = max(uBoundsMax - uBoundsMin, vec3(1e-4));
  vec3 p = clamp((vObjectPos - uBoundsMin) / span, 0.0, 1.0);

  // Triplanar blend weights from the object normal.
  vec3 n = normalize(vObjectNormal);
  vec3 blend = pow(abs(n), vec3(uBlendSharpness));
  blend /= max(blend.x + blend.y + blend.z, 1e-4);

  // Per-axis projected UVs.
  vec2 uvX = vec2(p.z, p.y);
  vec2 uvY = vec2(p.x, p.z);
  vec2 uvZ = vec2(p.x, p.y);

  // Pick the texture for each axis by the sign of the normal, mirroring the
  // negative-facing faces so adjacent faces read continuously.
  vec4 sx = n.x >= 0.0
    ? faceSample(uHasRight, uTexRight, uvX)
    : faceSample(uHasLeft, uTexLeft, vec2(1.0 - uvX.x, uvX.y));
  vec4 sy = n.y >= 0.0
    ? faceSample(uHasTop, uTexTop, uvY)
    : faceSample(uHasBottom, uTexBottom, vec2(uvY.x, 1.0 - uvY.y));
  vec4 sz = n.z >= 0.0
    ? faceSample(uHasFront, uTexFront, uvZ)
    : faceSample(uHasBack, uTexBack, vec2(1.0 - uvZ.x, uvZ.y));

  vec3 texColor = sx.rgb * blend.x + sy.rgb * blend.y + sz.rgb * blend.z;
  float coverage = sx.a * blend.x + sy.a * blend.y + sz.a * blend.z;

  // Soft fallback lighting for untextured / background areas.
  float ndl = dot(normalize(vViewNormal), normalize(vec3(0.35, 0.55, 0.8)));
  float lighting = 0.6 + 0.4 * (ndl * 0.5 + 0.5);

  vec3 base = uBaseColor * lighting;
  vec3 lit = texColor * (0.85 + 0.15 * lighting);
  vec3 color = mix(base, lit, clamp(coverage, 0.0, 1.0));

  gl_FragColor = vec4(color, 1.0);
}
