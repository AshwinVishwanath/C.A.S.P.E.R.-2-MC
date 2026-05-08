// Ambient liquid-metal shader for the LAB hero strip.
//
// Hand-rolled WebGL — no three.js, no extra deps. ~200 lines.
// Fragment shader is a domain-warped fbm flow tinted by 4 token colors.
// Pauses on `quiet` prop or `prefers-reduced-motion: reduce`.

import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_a;     // deep
uniform vec3  u_b;     // mid
uniform vec3  u_c;     // accent 1
uniform vec3  u_d;     // accent 2
uniform float u_grain; // 0..0.03
uniform float u_intensity; // 0..1, fades shader

// 2D hash + value noise.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 p  = uv * vec2(u_res.x / u_res.y, 1.0) * 1.6;
  float t  = u_time * 0.05;

  // Domain warp -> liquid feel.
  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, -t * 1.3)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 4.0 * r);

  // Sharpen flow into metallic ridges.
  float ridge = smoothstep(0.40, 0.85, f);
  float flow  = pow(f, 1.6);

  // Color ramp: deep -> mid -> accent1 -> accent2.
  vec3 col = mix(u_a, u_b, smoothstep(0.0, 0.5, flow));
  col = mix(col, u_c, smoothstep(0.45, 0.78, flow) * 0.7);
  col = mix(col, u_d, ridge * 0.55);

  // Specular streak that drifts horizontally.
  float spec = smoothstep(0.86, 1.0, fbm(p * 1.4 + vec2(t * 1.4, 0.0)));
  col += u_d * spec * 0.18;

  // Subtle film grain.
  float g = (hash(uv * u_res + t) - 0.5) * u_grain;
  col += g;

  // Vignette toward edges so the shader sits naturally behind UI chrome.
  float edge = smoothstep(0.95, 0.4, length(uv - 0.5) * 1.4);

  // Intensity fade lets us soften the shader behind dense panels.
  col = mix(u_a, col, u_intensity * edge);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader compile: " + log);
  }
  return s;
}

export default function LiquidMetalCanvas(props) {
  const { palette, quiet, intensity = 1.0, style } = props;
  const canvasRef = useRef(null);
  const stateRef  = useRef({ gl: null, prog: null, locs: null, raf: 0, paused: false });

  // Init / dispose.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, alpha: false });
    if (!gl) return; // graceful fallback (CSS background remains)

    let prog;
    try {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("link: " + gl.getProgramInfoLog(prog));
      }
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    } catch (e) {
      console.warn("[LiquidMetalCanvas]", e);
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, "a_pos");
    const locs = {
      uRes:  gl.getUniformLocation(prog, "u_res"),
      uTime: gl.getUniformLocation(prog, "u_time"),
      uA:    gl.getUniformLocation(prog, "u_a"),
      uB:    gl.getUniformLocation(prog, "u_b"),
      uC:    gl.getUniformLocation(prog, "u_c"),
      uD:    gl.getUniformLocation(prog, "u_d"),
      uGrain:gl.getUniformLocation(prog, "u_grain"),
      uIntensity: gl.getUniformLocation(prog, "u_intensity"),
    };

    gl.useProgram(prog);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    stateRef.current.gl   = gl;
    stateRef.current.prog = prog;
    stateRef.current.locs = locs;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = canvas.clientWidth | 0;
      const h = canvas.clientHeight | 0;
      const W = Math.max(1, (w * dpr) | 0);
      const H = Math.max(1, (h * dpr) | 0);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
      gl.uniform2f(locs.uRes, W, H);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(stateRef.current.raf);
      ro.disconnect();
      try { gl.deleteBuffer(buf); gl.deleteProgram(prog); } catch (e) {}
      stateRef.current.gl = null;
    };
  }, []);

  // Render loop. Re-runs when palette / quiet / intensity change so static
  // frames repaint correctly when the user freezes the shader.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.gl || !s.prog || !s.locs) return;
    const { gl, locs } = s;
    gl.useProgram(s.prog);

    const reduced = typeof window !== "undefined"
      && window.matchMedia
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    gl.uniform3f(locs.uA, palette.a[0], palette.a[1], palette.a[2]);
    gl.uniform3f(locs.uB, palette.b[0], palette.b[1], palette.b[2]);
    gl.uniform3f(locs.uC, palette.c[0], palette.c[1], palette.c[2]);
    gl.uniform3f(locs.uD, palette.d[0], palette.d[1], palette.d[2]);
    gl.uniform1f(locs.uGrain, palette.grain);
    gl.uniform1f(locs.uIntensity, intensity);

    cancelAnimationFrame(s.raf);

    const start = performance.now();
    const isFrozen = quiet || reduced;
    const draw = (now) => {
      const t = ((now - start) / 1000);
      gl.uniform1f(locs.uTime, isFrozen ? 0.0 : t);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!isFrozen) s.raf = requestAnimationFrame(draw);
    };
    s.raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(s.raf);
  }, [palette, quiet, intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}
