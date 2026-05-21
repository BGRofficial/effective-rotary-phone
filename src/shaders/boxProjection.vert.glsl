// Box-projection vertex stage.
//
// Projection is done in OBJECT space so the textures stay locked to the proxy
// while the camera orbits. A view-space normal is also passed through purely
// for the soft fallback lighting on untextured areas.

varying vec3 vObjectPos;
varying vec3 vObjectNormal;
varying vec3 vViewNormal;

void main() {
  vObjectPos = position;
  vObjectNormal = normalize(normal);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
