import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createScreen } from './screens.js';

// Line-art watch: flat paper fills, a black silhouette (inverted hull) and crease edges.
// Kept cheap on purpose: no lights, no post-processing, 30 fps cap, the screen texture is
// redrawn at 15 fps, pixel ratio ≤ 1.5, and rendering stops while the tab is hidden.

// rig: the values GSAP tweens on scroll. morph: 0 = round watch, 1 = rect watch.
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

  const roundScreen = createScreen(448, 448);
  const rectScreen = createScreen(378, 450);
  const roundTex = new THREE.CanvasTexture(roundScreen.canvas);
  const rectTex = new THREE.CanvasTexture(rectScreen.canvas);
  for (const t of [roundTex, rectTex]) t.colorSpace = THREE.SRGBColorSpace;

  // round case
  const round = new THREE.Group();
  const caseR = inked(new THREE.CylinderGeometry(1.22, 1.18, 0.38, 72, 1), { angle: 20 });
  caseR.rotation.x = Math.PI / 2;
  round.add(caseR);
  const bezel = inked(new THREE.TorusGeometry(1.15, 0.06, 10, 96), { angle: 60, hull: false });
  bezel.position.z = 0.19;
  round.add(bezel);
  const screenR = new THREE.Mesh(new THREE.CircleGeometry(1.08, 96), new THREE.MeshBasicMaterial({ map: roundTex }));
  screenR.position.z = 0.195;
  round.add(screenR);
  const crown = inked(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 24), { angle: 20 });
  crown.rotation.z = Math.PI / 2; crown.position.set(1.28, 0.25, 0);
  const btn = inked(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 20), { angle: 20 });
  btn.rotation.z = Math.PI / 2; btn.position.set(1.25, -0.3, 0);
  round.add(crown, btn);
  watch.add(round);

  // rect case, modelled on the Redmi Watch 5: 47.5 × 41.1 × 11.3 mm aluminium body,
  // deep rounded corners, 2 mm bezel around a 2.07" 432×514 AMOLED, crown on the right.
  const MM = 2.05 / 41.1;
  const W = 41.1 * MM, H = 47.5 * MM, T = 11.3 * MM;
  const rect = new THREE.Group();
  const edge = 0.07;
  const caseGeo = new THREE.ExtrudeGeometry(roundedRect(W - edge * 2, H - edge * 2, 10.5 * MM - edge), {
    depth: T - edge * 2, bevelEnabled: true, bevelThickness: edge, bevelSize: edge, bevelSegments: 4, curveSegments: 16,
  });
  caseGeo.translate(0, 0, -(T - edge * 2) / 2);
  rect.add(inked(caseGeo, { angle: 40 }));
  const front = T / 2;
  const bezelQ = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 0.1, H - 0.1, 10 * MM), 16), fillDark);
  bezelQ.position.z = front + 0.004;
  rect.add(bezelQ);
  const sw = W - 0.1 - 4 * MM, sh = H - 0.1 - 4 * MM;
  const screenQ = new THREE.Mesh(normalizeUv(new THREE.ShapeGeometry(roundedRect(sw, sh, 8 * MM), 16), sw, sh), new THREE.MeshBasicMaterial({ map: rectTex }));
  screenQ.position.z = front + 0.008;
  rect.add(screenQ);
  const crownQ = inked(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 24), { angle: 20 });
  crownQ.rotation.z = Math.PI / 2; crownQ.position.set(W / 2 + 0.05, 0.42, 0);
  rect.add(crownQ);
  rect.scale.setScalar(0.001);
  watch.add(rect);

  // straps with dashed stitching
  const sl = 1.9, swd = 1.02, r = 0.22;
  const strapGeo = new THREE.ExtrudeGeometry(roundedRect(swd, sl, r), { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 8 });
  strapGeo.translate(0, sl / 2, -0.07);
  const stitch = roundedRect(swd - 0.2, sl - 0.24, r - 0.1).getPoints(10).map((p) => new THREE.Vector3(p.x, p.y + sl / 2, 0.11));
  const top = inked(strapGeo, { angle: 40 });
  top.position.set(0, 0.95, -0.1); top.rotation.x = -0.35;
  const bottom = inked(strapGeo, { angle: 40 });
  bottom.position.set(0, -0.95, -0.1); bottom.rotation.set(0.35, 0, Math.PI);
  top.add(dashedLine(stitch, 0.035, 0.7));
  bottom.add(dashedLine(stitch, 0.035, 0.7));
  watch.add(top, bottom);

  // orbits: dashed ellipses that follow the watch and slowly turn
  const orbit = new THREE.Group();
  const o1 = dashedLine(ellipse(2.1, 2.1), 0.06), o2 = dashedLine(ellipse(2.55, 1.2), 0.04);
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
  let last = 0, lastScreen = 0, running = true;
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

    const m = THREE.MathUtils.smoothstep(rig.morph, 0, 1);
    round.scale.setScalar(Math.max(0.001, 1 - m));
    rect.scale.setScalar(Math.max(0.001, m));
    watch.position.set(rig.x, rig.y + Math.sin(t * 1.1) * 0.04, rig.z);
    watch.rotation.set(rig.rx + mouse.sy * 0.12, rig.ry + rig.spin + mouse.sx * 0.2, rig.rz);
    watch.scale.setScalar(rig.s);
    hullMat.uniforms.width.value = 0.011 / Math.max(0.35, rig.s);
    orbit.position.copy(watch.position);
    orbit.scale.setScalar(rig.s);
    orbit.rotation.z = t * 0.08;

    if (now - lastScreen >= SCREEN) {
      lastScreen = now;
      const roundUp = m < 0.5;
      const scr = roundUp ? roundScreen : rectScreen;
      scr.set(screenApp, t);
      scr.draw(t, roundUp ? 'round' : 'rect');
      (roundUp ? roundTex : rectTex).needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  return {
    setApp(name) { screenApp = name; },
  };
}
