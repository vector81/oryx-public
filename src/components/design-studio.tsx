"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./design-studio.module.css";

const vertexSource = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
const fragmentSource = `
precision highp float;
uniform vec2 resolution;
uniform float time;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.,0.)), f.x),
             mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0., a = .5;
  for(int i=0; i<5; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3;
    a *= .5;
  }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  // The fire grows from a broad base and narrows into independently curling tongues.
  float y = (uv.y - .14) / .74;
  float x = (uv.x - .5) * 2.0;
  float t = time * .65;
  vec2 flow = vec2(x * 3.6, y * 3.1 - t * 1.65);
  float broad = fbm(flow);
  float curl = fbm(flow * 1.7 + vec2(broad * 2.2, -t * .4));
  float sway = sin(y * 5.8 - t * 1.1) * .085 * y;
  float warpedX = x + sway + (broad - .5) * (.09 + .3 * y);
  float width = .30 * pow(max(0., 1.0 - y), .66);
  width *= smoothstep(-.035, .11, y);
  float edge = width - abs(warpedX);
  float turbulence = (curl - .45) * (.055 + .16 * y);
  float body = smoothstep(-.025, .04, edge + turbulence);
  body *= smoothstep(-.015, .055, y) * (1. - smoothstep(.84, 1.05, y));
  // Two smaller side tongues break the central silhouette without repeating it.
  float leftY = (y - .05) / .65;
  float leftX = x + .24 + sin(leftY * 5. - t) * .045;
  float left = smoothstep(-.02, .025, .105 * max(0., 1. - leftY) - abs(leftX) + (broad - .5) * .10);
  left *= smoothstep(.0,.10,y) * (1. - smoothstep(.45,.69,y));
  float rightY = (y - .04) / .51;
  float rightX = x - .25 - sin(rightY * 5.5 - t * 1.3) * .045;
  float right = smoothstep(-.02,.025,.105 * max(0.,1.-rightY) - abs(rightX) + (curl-.5)*.08);
  right *= smoothstep(.0,.1,y) * (1.-smoothstep(.32,.55,y));
  float shape = max(body, max(left, right));
  float fine = fbm(vec2(warpedX * 11. + broad * 3., y * 6. - t * 3.));
  float ribbons = pow(1. - abs(fine * 2. - 1.), 9.);
  float hollow = fbm(vec2(x * 6. + curl * 2., y * 4. - t * 2.));
  float density = .15 + .64 * ribbons + .28 * smoothstep(.38,.68,hollow);
  float core = exp(-abs(warpedX) * 15.) * exp(-pow((y-.16)*4.5,2.));
  float intensity = shape * (density + core * .7);
  // A thin luminous edge; no opaque emblem or geometric inner cut-out.
  intensity += body * exp(-abs(edge+turbulence) * 100.) * .2;
  float halo = exp(-abs(x) * 13. - abs(y-.18) * 7.) * .08;
  float fade = smoothstep(-.02,.03,y) * (1.-smoothstep(.98,1.08,y));
  intensity = (intensity + halo) * fade;
  intensity = pow(clamp(intensity,0.,1.), .85);
  gl_FragColor = vec4(vec3(intensity), 1.);
}
`;

export default function DesignStudio() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const gl = element.getContext("webgl", { alpha: false, antialias: false, powerPreference: "low-power" });
    if (!gl) { setUnavailable(true); return; }
    function shader(type: number, source: string) {
      const value = gl!.createShader(type)!;
      gl!.shaderSource(value, source); gl!.compileShader(value);
      if (!gl!.getShaderParameter(value, gl!.COMPILE_STATUS)) { gl!.deleteShader(value); return null; }
      return value;
    }
    const vertex = shader(gl.VERTEX_SHADER, vertexSource);
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) { if(vertex) gl.deleteShader(vertex); if(fragment) gl.deleteShader(fragment); setUnavailable(true); return; }
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); setUnavailable(true); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, previous = 0;
    const start = performance.now();
    function draw(now: number) {
      if (document.hidden || gl!.isContextLost()) return;
      if (now - previous >= 32 || reduced.matches) {
        const size = Math.min(720, Math.round(element!.clientWidth * Math.min(devicePixelRatio, 1.5)));
        if(element!.width !== size) { element!.width = size; element!.height = size; }
        gl!.viewport(0,0,size,size); gl!.uniform2f(resolution,size,size);
        gl!.uniform1f(time, reduced.matches ? 2.4 : (now-start)/1000);
        gl!.drawArrays(gl!.TRIANGLES,0,6); previous = now;
      }
      if (!reduced.matches) frame = requestAnimationFrame(draw);
    }
    function resume() { cancelAnimationFrame(frame); previous = 0; draw(performance.now()); }
    const resize = new ResizeObserver(resume); resize.observe(element);
    reduced.addEventListener("change",resume); document.addEventListener("visibilitychange",resume);
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setUnavailable(true); };
    element.addEventListener("webglcontextlost",lost);
    resume();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); reduced.removeEventListener("change",resume); document.removeEventListener("visibilitychange",resume); element.removeEventListener("webglcontextlost",lost); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); };
  }, []);
  return <main className={styles.canvas} aria-label="White flame study">
    <canvas ref={canvas} className={styles.flame} aria-label="Animated white flame rendered procedurally" role="img" />
    {unavailable && <p className={styles.error}>The flame renderer needs WebGL enabled in this browser.</p>}
  </main>;
}
