/// <reference types="vite/client" />

// GLSL shader sources are imported as raw strings, e.g.
//   import frag from './shader.glsl?raw'
declare module '*.glsl?raw' {
  const src: string;
  export default src;
}
