// Dreamtools v2: espaço 3D atrás do site (three.js). Os postais dos voos flutuam num corredor;
// a câmera viaja com a rolagem e o mouse dá a paralaxe.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const PCS = window.DT_PCS || [];
const cv = document.getElementById('space');
const mobile = matchMedia('(max-width: 760px)').matches;
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const BG = 0x0b0b0e;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.FogExp2(BG, mobile ? 0.026 : 0.017);
const camera = new THREE.PerspectiveCamera(mobile ? 70 : 55, 1, 0.1, 500);

// corredor de postais
const GAP = mobile ? 4.6 : 5.2;
const cards = [];
const geo = new THREE.PlaneGeometry(1, 1);
const loader = new THREE.TextureLoader();
PCS.forEach((url, i) => {
  const a = i * 2.39996 + 0.6;               // ângulo áureo: espalha sem repetir
  const r = (mobile ? 3.2 : 5.4) + (i % 3) * 1.1;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: true });
  const m = new THREE.Mesh(geo, mat);
  const w = mobile ? 3.4 : 5.0;
  m.scale.set(w, w / 1.75, 1);
  m.position.set(Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.66, -i * GAP - 3);
  m.rotation.set(Math.sin(a) * 0.1, -Math.cos(a) * 0.22, (Math.random() - 0.5) * 0.08);
  m.userData = { url, base: m.position.clone(), ph: Math.random() * 6.28, rz: m.rotation.z, loaded: false };
  scene.add(m);
  cards.push(m);
});
const DEPTH = PCS.length * GAP + 12;

// carrega na ordem do corredor, poucos de cada vez
let next = 0, busy = 0;
function pump() {
  while (busy < 3 && next < cards.length) {
    const m = cards[next++]; busy++;
    loader.load(m.userData.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const k = t.image.width / t.image.height;
      m.scale.y = m.scale.x / k;
      m.material.map = t; m.material.needsUpdate = true; m.userData.loaded = true;
      busy--; pump();
    }, undefined, () => { busy--; pump(); });
  }
}
pump();

// poeira de estrelas
{
  const n = mobile ? 900 : 2200, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, r = 9 + Math.random() * 40;
    p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = Math.sin(a) * r * 0.7; p[i * 3 + 2] = 10 - Math.random() * (DEPTH + 40);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd6ff, size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.75, fog: true })));
}
// brilho quente bem no fundo, como um sol distante no fim do corredor
{
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.15, 'rgba(255,150,60,.55)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  s.scale.set(60, 60, 1); s.position.set(0, 0, -DEPTH - 30); scene.add(s);
}

// entrada: mouse/toque e rolagem
let mx = 0, my = 0, tx = 0, ty = 0;
addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
function scrollP() { const h = document.documentElement.scrollHeight - innerHeight; return h > 0 ? scrollY / h : 0; }
let cz = 8 - scrollP() * DEPTH;

function size() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', size); size();

const clock = new THREE.Clock();
let visible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
function frame() {
  requestAnimationFrame(frame);
  if (!visible) return;
  const t = clock.getElapsedTime();
  mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
  const z = 8 - scrollP() * DEPTH;
  cz += (z - cz) * 0.07;
  camera.position.set(mx * 1.4 + Math.sin(t * 0.13) * 0.4, -my * 0.9 + Math.cos(t * 0.11) * 0.3, cz);
  camera.lookAt(mx * 0.5, -my * 0.3, cz - 22);
  camera.rotation.z += mx * 0.03;
  for (const m of cards) {
    const u = m.userData, d = m.position.z - cz;
    m.position.y = u.base.y + Math.sin(t * 0.6 + u.ph) * 0.12;
    m.rotation.z = u.rz + Math.sin(t * 0.4 + u.ph) * 0.02;
    // aparece suave quando carrega; some ao passar pela câmera
    const target = u.loaded ? (d > 1.5 ? 0 : d > -2 ? (1.5 - d) / 3.5 : 1) : 0;
    m.material.opacity += (target - m.material.opacity) * 0.08;
    m.visible = m.material.opacity > 0.01;
  }
  renderer.render(scene, camera);
}
frame();

// janelas dimensionais: cada seção é uma janela que gira de leve conforme passa pela tela
const wins = [...document.querySelectorAll('.win')];
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('in'); }), { threshold: 0.08 });
wins.forEach((w) => io.observe(w));
function tilt() {
  const vh = innerHeight;
  for (const w of wins) {
    if (!w.classList.contains('in')) continue;
    const r = w.getBoundingClientRect();
    if (r.bottom < -100 || r.top > vh + 100) continue;
    const c = (r.top + Math.min(r.height, vh) / 2 - vh / 2) / vh; // -1..1
    w.style.setProperty('--rx', (c * 5).toFixed(2) + 'deg');
    w.style.setProperty('--ry', (mx * -2.5).toFixed(2) + 'deg');
    w.style.setProperty('--tz', (-Math.abs(c) * 60).toFixed(1) + 'px');
  }
  requestAnimationFrame(tilt);
}
tilt();
