import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createScreen } from './screens.js';

// rig: the values GSAP tweens on scroll. morph: 0 = round watch, 1 = rect watch.
export const rig = { x: 1.9, y: 0, z: 0, rx: 0.15, ry: -0.5, rz: 0, s: 1, morph: 0, spin: 0, hue: 0 };

export function createWatchScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x05070b, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070b, 0.045);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
  const rimC = new THREE.PointLight(0x38bdf8, 30, 20); rimC.position.set(-4, 1, -2); scene.add(rimC);
  const rimO = new THREE.PointLight(0xff6a2b, 18, 20); rimO.position.set(4, -2, -1); scene.add(rimO);

  // ---- watch ----
  const watch = new THREE.Group();
  scene.add(watch);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 1, roughness: 0.25 });
  const metalLight = new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 1, roughness: 0.18 });
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x10151d, metalness: 0.1, roughness: 0.65 });

  const roundScreen = createScreen(512, 512);
  const rectScreen = createScreen(432, 514);
  const roundTex = new THREE.CanvasTexture(roundScreen.canvas);
  const rectTex = new THREE.CanvasTexture(rectScreen.canvas);
  for (const t of [roundTex, rectTex]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }

  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.05, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 0.5, depthWrite: false });

  // round case
  const round = new THREE.Group();
  const caseR = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.18, 0.38, 128, 1), metal);
  caseR.rotation.x = Math.PI / 2;
  round.add(caseR);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.065, 24, 160), metalLight);
  bezel.position.z = 0.19;
  round.add(bezel);
  const screenR = new THREE.Mesh(new THREE.CircleGeometry(1.08, 128), new THREE.MeshBasicMaterial({ map: roundTex, toneMapped: false }));
  screenR.position.z = 0.192;
  round.add(screenR);
  const glassR = new THREE.Mesh(new THREE.CircleGeometry(1.1, 128), glassMat);
  glassR.position.z = 0.21;
  round.add(glassR);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 32), metalLight);
  crown.rotation.z = Math.PI / 2; crown.position.set(1.28, 0.25, 0);
  round.add(crown);
  const btn = crown.clone(); btn.scale.set(0.8, 0.8, 0.8); btn.position.set(1.26, -0.3, 0);
  round.add(btn);
  watch.add(round);

  // rect case
  const rect = new THREE.Group();
  const caseQ = new THREE.Mesh(new RoundedBoxGeometry(2.05, 2.4, 0.38, 8, 0.42), metal);
  rect.add(caseQ);
  const screenQ = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 2.05), new THREE.MeshBasicMaterial({ map: rectTex, toneMapped: false }));
  screenQ.position.z = 0.193;
  rect.add(screenQ);
  const glassQ = new THREE.Mesh(new RoundedBoxGeometry(1.86, 2.2, 0.02, 4, 0.01), glassMat);
  glassQ.position.z = 0.2;
  rect.add(glassQ);
  const crownQ = crown.clone(); crownQ.position.set(1.08, 0.35, 0);
  rect.add(crownQ);
  rect.scale.setScalar(0.001);
  watch.add(rect);

  // straps: extruded rounded rectangles tilted back
  const shape = new THREE.Shape();
  const sw = 1.02, sl = 1.9, r = 0.22;
  shape.moveTo(-sw / 2 + r, 0); shape.lineTo(sw / 2 - r, 0); shape.quadraticCurveTo(sw / 2, 0, sw / 2, r);
  shape.lineTo(sw / 2, sl - r); shape.quadraticCurveTo(sw / 2, sl, sw / 2 - r, sl); shape.lineTo(-sw / 2 + r, sl);
  shape.quadraticCurveTo(-sw / 2, sl, -sw / 2, sl - r); shape.lineTo(-sw / 2, r); shape.quadraticCurveTo(-sw / 2, 0, -sw / 2 + r, 0);
  const strapGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 4, curveSegments: 12 });
  strapGeo.translate(0, 0, -0.08);
  const top = new THREE.Mesh(strapGeo, strapMat);
  top.position.set(0, 0.95, -0.1); top.rotation.x = -0.35;
  const bottom = new THREE.Mesh(strapGeo, strapMat);
  bottom.position.set(0, -0.95, -0.1); bottom.rotation.set(0.35, 0, Math.PI);
  watch.add(top, bottom);

  // ---- halo + particles ----
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(56,189,248,0.55)'); grd.addColorStop(0.4, 'rgba(167,139,250,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(7, 7, 1);
  halo.position.z = -1.2;
  scene.add(halo);

  const N = 1800;
  const pos = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const rad = 4 + Math.random() * 12, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = rad * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th) * 0.6;
    pos[i * 3 + 2] = rad * Math.cos(ph) - 6;
    seeds[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uHue: { value: 0 }, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float seed; uniform float uTime; uniform float uPx; varying float vSeed;
      void main() {
        vSeed = seed;
        vec3 p = position;
        p.y += sin(uTime * 0.3 + seed * 30.0) * 0.25;
        p.x += cos(uTime * 0.2 + seed * 20.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.5 + seed * 3.0) * uPx * (8.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uHue; varying float vSeed;
      vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (vec3(0.55, 0.62, 0.75) * t + vec3(0.1, 0.3, 0.5))); }
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 c = mix(vec3(0.22, 0.74, 0.97), pal(vSeed + uHue), 0.55);
        gl_FragColor = vec4(c, (1.0 - d * 2.0) * 0.75);
      }`,
  });
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // ---- post ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const clock = new THREE.Clock();
  let screenApp = 'face';
  let running = true;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) loop(); });

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;

    const m = THREE.MathUtils.smoothstep(rig.morph, 0, 1);
    round.scale.setScalar(Math.max(0.001, 1 - m));
    rect.scale.setScalar(Math.max(0.001, m));
    watch.position.set(rig.x, rig.y + Math.sin(t * 1.1) * 0.06, rig.z);
    watch.rotation.set(rig.rx + mouse.sy * 0.15 + Math.sin(t * 0.7) * 0.03, rig.ry + rig.spin + mouse.sx * 0.25, rig.rz);
    watch.scale.setScalar(rig.s);
    halo.position.x = rig.x * 0.9; halo.position.y = rig.y;
    halo.material.opacity = 0.6 + 0.25 * Math.sin(t * 0.9);
    points.rotation.y = t * 0.015 + mouse.sx * 0.08;
    points.rotation.x = mouse.sy * 0.04;
    pMat.uniforms.uTime.value = t;
    pMat.uniforms.uHue.value = rig.hue;

    if (m < 0.5) {
      roundScreen.set(screenApp, t); roundScreen.draw(t, 'round'); roundTex.needsUpdate = true;
    } else {
      rectScreen.set(screenApp, t); rectScreen.draw(t, 'rect'); rectTex.needsUpdate = true;
    }
    composer.render();
  }
  loop();

  return {
    setApp(name) { screenApp = name; },
  };
}
