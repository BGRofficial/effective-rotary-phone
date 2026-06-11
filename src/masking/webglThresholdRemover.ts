import type {
  BackgroundRemover,
  MaskOptions,
  MaskResult,
} from '../types';

/**
 * Lightweight, model-free background remover.
 *
 * It estimates the background color from the image corners, then runs a single
 * WebGL pass that turns per-pixel color distance into an alpha silhouette.
 * Good enough for high-contrast gallery shots; swap in an ONNX remover later
 * for cluttered backgrounds — both satisfy the `BackgroundRemover` interface.
 */

/** Longest-edge cap for the processed mask — keeps GPU work bounded on mobile. */
const MAX_DIM = 1024;

const VERT_SRC = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform vec3 uBgColor;
uniform float uThreshold;
uniform float uFeather;

// Weight chroma more than luminance so shadows on the object survive.
float colorDistance(vec3 a, vec3 b) {
  vec3 d = a - b;
  float luma = dot(d, vec3(0.299, 0.587, 0.114));
  float chroma = length(d - luma);
  return chroma * 0.75 + abs(luma) * 0.45;
}

void main() {
  vec4 src = texture2D(uImage, vUv);
  float dist = colorDistance(src.rgb, uBgColor);
  float alpha = smoothstep(
    uThreshold - uFeather,
    uThreshold + uFeather,
    dist
  );
  gl_FragColor = vec4(src.rgb, src.a * alpha);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log ?? 'unknown'}`);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${log ?? 'unknown'}`);
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

/** Fit (w, h) within MAX_DIM, preserving aspect ratio. */
function fitDimensions(w: number, h: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/** Average the four corner patches to guess the background color. */
function estimateBackgroundColor(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): [number, number, number] {
  const patch = Math.max(2, Math.round(Math.min(width, height) * 0.06));
  const corners: Array<[number, number]> = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (const [x, y] of corners) {
    const { data } = ctx.getImageData(x, y, patch, patch);
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }
  return [r / count / 255, g / count / 255, b / count / 255];
}

export class WebGLThresholdRemover implements BackgroundRemover {
  async removeBackground(
    image: ImageBitmap,
    options?: MaskOptions,
  ): Promise<MaskResult> {
    const threshold = options?.threshold ?? 0.16;
    const feather = options?.feather ?? 0.07;
    const { width, height } = fitDimensions(image.width, image.height);

    // 2D pass: downscale + sample corners for the background color.
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (!sourceCtx) throw new Error('2D canvas context unavailable');
    sourceCtx.drawImage(image, 0, 0, width, height);
    const bgColor = estimateBackgroundColor(sourceCtx, width, height);

    // WebGL pass: per-pixel threshold into an alpha silhouette.
    const glCanvas = document.createElement('canvas');
    glCanvas.width = width;
    glCanvas.height = height;
    const gl = glCanvas.getContext('webgl', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL context unavailable');

    const program = createProgram(gl);
    gl.useProgram(program);

    const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceCanvas,
    );

    gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);
    gl.uniform3fv(gl.getUniformLocation(program, 'uBgColor'), bgColor);
    gl.uniform1f(gl.getUniformLocation(program, 'uThreshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(program, 'uFeather'), feather);

    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Read the result back into a 2D canvas (the public MaskResult surface).
    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Cleanup GPU resources.
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) throw new Error('2D canvas context unavailable');
    maskCtx.putImageData(new ImageData(pixels, width, height), 0, 0);

    return { width, height, maskCanvas };
  }
}
