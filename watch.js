import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createScreen } from './screens.js';

// Line-art watch: flat paper fills, a black silhouette (inverted hull) and crease edges.
// Kept cheap on purpose: no lights, no post-processing, 30 fps cap, the screen texture is
// redrawn at 15 fps, pixel ratio ≤ 1.5, and rendering stops while the tab is hidden.

// rig: the values GSAP tweens on scroll. morph > 0.5 shows the dimension callouts.
export const rig = { x: 1.9, y: 0, z: 0, rx: 0.15, ry: -0.5, rz: 0, s: 1, morph: 0, spin: 0, hue: 0 };

const INK = 0x111111;
const PAPER = 0xfbfaf7;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
// ShapeGeometry UVs are in shape units; map them to 0..1 over the w×h box.
function normalizeUv(geo, w, h) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / w + 0.5, uv.getY(i) / h + 0.5);
  uv.needsUpdate = true;
  return geo;
}

const fill = new THREE.MeshBasicMaterial({ color: PAPER, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const fillDark = new THREE.MeshBasicMaterial({ color: INK });
const edgeMat = new THREE.LineBasicMaterial({ color: INK });
// silhouette: back faces pushed out along smooth normals, drawn in ink
const hullMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { width: { value: 0.014 } },
  vertexShader: 'uniform float width; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * width, 1.0); }',
  fragmentShader: 'void main() { gl_FragColor = vec4(0.067, 0.067, 0.067, 1.0); }',
});

// Mesh with paper fill + ink outline + crease lines.
function inked(geo, { angle = 35, hull = true } = {}) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, fill));
  if (hull) {
    const h = geo.clone();
    h.deleteAttribute('normal');
    if (h.attributes.uv) h.deleteAttribute('uv');
    const smooth = mergeVertices(h, 1e-4);
    smooth.computeVertexNormals();
    g.add(new THREE.Mesh(smooth, hullMat));
  }
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, angle), edgeMat));
  return g;
}

function dashedLine(points, dash, opacity = 0.55) {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: INK, dashSize: dash, gapSize: dash, transparent: true, opacity }));
  line.computeLineDistances();
  return line;
}
const ellipse = (rx, ry) => new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2).getPoints(160);

export function createWatchScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const watch = new THREE.Group();
  scene.add(watch);

  // 432×514 panel, drawn at 7/8 size to keep the canvas cheap
  const rectScreen = createScreen(378, 450);
  const rectTex = new THREE.CanvasTexture(rectScreen.canvas);
  rectTex.colorSpace = THREE.SRGBColorSpace;

  // Redmi Watch 5, to scale (official specs): 47.5 × 41.1 × 11.3 mm aluminium body,
  // 2.07" AMOLED 432×514 (active area ≈ 33.8 × 40.3 mm), deep rounded corners,
  // rotating crown on the right, 22 mm quick-release strap, sensor dome on the back.
  const MM = 2.05 / 41.1; // 1 unit ≈ 20 mm
  const W = 41.1 * MM, H = 47.5 * MM, T = 11.3 * MM;
  const BODY = 9.6 * MM, DOME = T - BODY; // case + sensor dome = 11.3 mm
  const rect = new THREE.Group();
  const edge = 1.6 * MM; // rounded side of the frame
  const caseGeo = new THREE.ExtrudeGeometry(roundedRect(W - edge * 2, H - edge * 2, 11 * MM - edge), {
    depth: BODY - edge * 2, bevelEnabled: true, bevelThickness: edge, bevelSize: edge, bevelSegments: 4, curveSegments: 16,
  });
  caseGeo.translate(0, 0, -(BODY - edge * 2) / 2);
  rect.add(inked(caseGeo, { angle: 40 }));
  const front = BODY / 2;
  // black glass: the panel minus a ≈1 mm metal rim
  const bezelQ = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 2 * MM, H - 2 * MM, 10 * MM), 16), fillDark);
  bezelQ.position.z = front + 0.004;
  rect.add(bezelQ);
  const sw = 33.8 * MM, sh = 40.3 * MM;
  const screenQ = new THREE.Mesh(normalizeUv(new THREE.ShapeGeometry(roundedRect(sw, sh, 7 * MM), 16), sw, sh), new THREE.MeshBasicMaterial({ map: rectTex }));
  screenQ.position.z = front + 0.008;
  rect.add(screenQ);
  const crownQ = inked(new THREE.CylinderGeometry(2.6 * MM, 2.6 * MM, 2.6 * MM, 24), { angle: 20 });
  crownQ.rotation.z = Math.PI / 2; crownQ.position.set(W / 2 + 1.1 * MM, 7 * MM, 0);
  rect.add(crownQ);
  const dome = inked(new THREE.CylinderGeometry(12 * MM, 13.5 * MM, DOME, 40), { angle: 20 });
  dome.rotation.x = Math.PI / 2; dome.position.z = -front - DOME / 2;
  rect.add(dome);
  watch.add(rect);

  // dimension callouts, drafting style
  const dims = new THREE.Group();
  const label = (text) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '500 34px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f4f2ec'; const w = g.measureText(text).width + 24; g.fillRect(128 - w / 2, 8, w, 48);
    g.fillStyle = '#111'; g.fillText(text, 128, 33);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  };
  const seg = (pts) => new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts.map(([x, y]) => new THREE.Vector3(x, y, front))), edgeMat);
  const tk = 0.06, oy = -H / 2 - 0.32, ox = -W / 2 - 0.36;
  dims.add(seg([[-W / 2, oy], [W / 2, oy], [-W / 2, oy - tk], [-W / 2, oy + tk], [W / 2, oy - tk], [W / 2, oy + tk]]));
  dims.add(dashedLine([new THREE.Vector3(-W / 2, -H / 2, front), new THREE.Vector3(-W / 2, oy, front)], 0.03, 0.6));
  dims.add(dashedLine([new THREE.Vector3(W / 2, -H / 2, front), new THREE.Vector3(W / 2, oy, front)], 0.03, 0.6));
  dims.add(seg([[ox, -H / 2], [ox, H / 2], [ox - tk, -H / 2], [ox + tk, -H / 2], [ox - tk, H / 2], [ox + tk, H / 2]]));
  dims.add(dashedLine([new THREE.Vector3(-W / 2, H / 2, front), new THREE.Vector3(ox, H / 2, front)], 0.03, 0.6));
  dims.add(dashedLine([new THREE.Vector3(-W / 2, -H / 2, front), new THREE.Vector3(ox, -H / 2, front)], 0.03, 0.6));
  const lw = label('41.1 mm'); lw.position.set(0, oy, front + 0.01);
  const lh = label('47.5 mm'); lh.position.set(ox, 0, front + 0.01); lh.rotation.z = Math.PI / 2;
  const lt = label('11.3 mm'); lt.position.set(W / 2 + 0.55, -H / 2 + 0.1, front + 0.01);
  dims.add(lw, lh, lt);
  dims.visible = false;
  watch.add(dims);

  // 22 mm straps with dashed stitching, hinged at the case ends
  const sl = 1.9, swd = 22 * MM, r = 0.2;
  const strapGeo = new THREE.ExtrudeGeometry(roundedRect(swd, sl, r), { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 8 });
  strapGeo.translate(0, sl / 2, -0.06);
  const stitch = roundedRect(swd - 0.18, sl - 0.24, r - 0.08).getPoints(10).map((p) => new THREE.Vector3(p.x, p.y + sl / 2, 0.1));
  const top = inked(strapGeo, { angle: 40 });
  top.position.set(0, H / 2 - 0.16, -0.12); top.rotation.x = -0.4;
  const bottom = inked(strapGeo, { angle: 40 });
  bottom.position.set(0, -H / 2 + 0.16, -0.12); bottom.rotation.set(0.4, 0, Math.PI);
  top.add(dashedLine(stitch, 0.035, 0.7));
  bottom.add(dashedLine(stitch, 0.035, 0.7));
  watch.add(top, bottom);

  // orbits: dashed ellipses that follow the watch and slowly turn
  const orbit = new THREE.Group();
  const o1 = dashedLine(ellipse(2.2, 2.2), 0.06), o2 = dashedLine(ellipse(2.7, 1.25), 0.04);
  o1.rotation.x = 1.15; o2.rotation.set(0.5, 0.4, 0);
  orbit.add(o1, o2);
  scene.add(orbit);

  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let screenApp = 'face';
  let last = 0, lastScreen = 0, running = true, kick = 0, turn = 0, lastY = window.scrollY;
  const FRAME = 1000 / 30, SCREEN = 1000 / 15;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) requestAnimationFrame(loop);
  });

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - last < FRAME) return;
    last = now;
    const t = now / 1000;
    mouse.sx += (mouse.x - mouse.sx) * 0.1;
    mouse.sy += (mouse.y - mouse.sy) * 0.1;

    // own motion: slow turntable sway + float, plus a spin kick from scroll speed
    const y = window.scrollY;
    const v = THREE.MathUtils.clamp((y - lastY) * 0.0012, -0.12, 0.12);
    lastY = y;
    // spring: the kick spins the watch, then it settles back facing the reader
    kick = kick * 0.86 + v;
    turn = (turn + kick) * 0.93;
    const calm = 1 - 0.75 * THREE.MathUtils.clamp(rig.morph, 0, 1);
    watch.position.set(rig.x, rig.y + Math.sin(t * 1.1) * 0.07, rig.z);
    watch.rotation.set(
      rig.rx + Math.sin(t * 0.43) * 0.09 * calm + mouse.sy * 0.15,
      rig.ry + rig.spin + turn + Math.sin(t * 0.55) * 0.3 * calm + mouse.sx * 0.25 * calm,
      rig.rz + Math.sin(t * 0.31) * 0.03,
    );
    watch.scale.setScalar(rig.s);
    dims.visible = rig.morph > 0.5;
    hullMat.uniforms.width.value = 0.011 / Math.max(0.35, rig.s);
    orbit.position.copy(watch.position);
    orbit.scale.setScalar(rig.s);
    orbit.rotation.z = t * 0.12;

    if (now - lastScreen >= SCREEN) {
      lastScreen = now;
      rectScreen.set(screenApp, t);
      rectScreen.draw(t, 'rect');
      rectTex.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  return {
    setApp(name) { screenApp = name; },
  };
}
