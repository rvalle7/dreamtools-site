// Dreamtools v2 — túnel em órbita. A rolagem leva a câmera para a frente; capa, trabalhos e
// ferramentas flutuam no caminho e passam por você. Postais ao longe; a Terra e o sol ao fundo.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const PCS = window.DT_PCS || [];
const mobile = matchMedia('(max-width: 760px)').matches;
const PX = 0.01;              // 1 px do HTML = 0,01 unidade
const PXU = mobile ? 70 : 85; // px de rolagem por unidade de profundidade
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------- renderizadores ----------
const cv = $('#space');
const gl = new THREE.WebGLRenderer({ canvas: cv, antialias: !mobile, powerPreference: 'high-performance' });
gl.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
gl.outputColorSpace = THREE.SRGBColorSpace;
gl.autoClear = false;
const css = new CSS3DRenderer();
css.domElement.id = 'css3d';
document.body.appendChild(css.domElement);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
const scene = new THREE.Scene();       // túnel (WebGL)
const cssScene = new THREE.Scene();    // HTML em 3D

// ---------- fundo: Terra em órbita + sol ----------
const bg = new THREE.Scene();
const bgCam = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
const SUN = new THREE.Vector3();   // calculado depois de pôr a Terra: logo atrás da borda dela
{
  // estrelas
  const n = 2600, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
    p.set([v.x, v.y, v.z], i * 3);
    const k = 0.55 + Math.random() * 0.45; c.set([k, k, Math.min(1, k * 1.1)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  bg.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9 })));
}
const tl = new THREE.TextureLoader();
const earthMat = new THREE.ShaderMaterial({
  uniforms: {
    dayT: { value: null }, nightT: { value: null }, sun: { value: SUN },
  },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal);
      vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform sampler2D dayT; uniform sampler2D nightT; uniform vec3 sun;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float l=dot(normalize(vN),sun);
      float day=smoothstep(-0.12,0.25,l);
      vec3 d=texture2D(dayT,vUv).rgb*1.15;
      vec3 n=texture2D(nightT,vUv).rgb; n=pow(n,vec3(1.25))*vec3(2.4,1.9,1.3);
      vec3 col=mix(n+d*0.012, d*(0.25+0.9*max(l,0.)), day);
      float rim=pow(1.-max(dot(normalize(vN),vV),0.),3.0);
      float lit=smoothstep(-0.35,0.5,l);
      float rim5=pow(1.-max(dot(normalize(vN),vV),0.),5.0); float s=pow(max(dot(-vV,sun),0.),60.); vec3 atm=mix(vec3(0.08,0.2,0.55),vec3(1.0,0.55,0.2),s)*rim5*(0.35+2.5*lit);
      // faixa do crepúsculo
      float tw=exp(-pow(l*7.,2.))*0.6; col+=vec3(1.0,0.45,0.15)*tw*0.25;
      gl_FragColor=vec4(col+atm,1.);
      #include <colorspace_fragment>
    }`,
});
const R = 60;
const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), earthMat);
earth.position.set(-74, -50, -150);
earth.rotation.set(0.35, -1.2, 0.41);   // Brasil virado para nós
bg.add(earth);
{ // sol: um pouco além da borda da Terra, em cima à direita (o flare encosta no horizonte)
  const c = earth.position.clone().normalize();
  const ang = Math.asin(R / earth.position.length()) * 1.06;
  const want = new THREE.Vector3(1, 0.42, 0).normalize();
  const axis = new THREE.Vector3().crossVectors(c, want).normalize();
  SUN.copy(c).applyAxisAngle(axis, ang);
  earthMat.uniforms.sun.value.copy(SUN);
}
// halo da atmosfera
const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 96, 64), new THREE.ShaderMaterial({
  uniforms: { sun: { value: SUN } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vV;
    void main(){ float f=pow(clamp(1.0+dot(vN,vV)*1.0,0.,1.),0.0); float e=pow(1.-abs(dot(vN,vV)),6.);
      float s=pow(max(dot(-vV,sun),0.),40.); vec3 c=mix(vec3(0.2,0.45,1.0),vec3(1.0,0.6,0.25),s);
      gl_FragColor=vec4(c*e*(0.35+2.2*s),1.); }`,
}));
halo.position.copy(earth.position);
bg.add(halo);
tl.load('/v2/tex/earth-day.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; earthMat.uniforms.dayT.value = t; });
tl.load('/v2/tex/earth-night.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; earthMat.uniforms.nightT.value = t; });
// sol: disco + brilho dourado + risco anamórfico
function glowTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, s]) => gr.addColorStop(o, s)); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sunGroup = new THREE.Group();
const add = (map, s, sx = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); m.scale.set(s * sx, s, 1); sunGroup.add(m); return m; };
add(glowTex([[0, 'rgba(255,190,110,.55)'], [0.25, 'rgba(255,120,40,.22)'], [1, 'rgba(255,80,20,0)']]), 260);
add(glowTex([[0, 'rgba(255,240,215,1)'], [0.18, 'rgba(255,200,120,.9)'], [0.45, 'rgba(255,130,40,.35)'], [1, 'rgba(255,100,30,0)']]), 70);
add(glowTex([[0, 'rgba(255,255,245,1)'], [0.4, 'rgba(255,235,190,.9)'], [1, 'rgba(255,200,120,0)']]), 16);
add(glowTex([[0, 'rgba(255,190,120,.5)'], [1, 'rgba(255,150,60,0)']]), 9, 34);   // risco horizontal
sunGroup.position.copy(SUN).multiplyScalar(700);
sunGroup.renderOrder = -1;
bg.add(sunGroup);

// ---------- conteúdo: capa e seções viram objetos 3D ----------
const items = [];   // {obj, el, z, wide}
const sections = []; // {id, z0, head}
function place(el, x, y, z, ry = 0, wide = false) {
  el.classList.add('it');
  const o = new CSS3DObject(el);
  o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(PX);
  cssScene.add(o);
  items.push({ o, el, z, wide });
  return o;
}
let z = 0;
// capa no centro, um pouco acima
{
  const hero = $('header.hero .wrap');
  const box = document.createElement('div'); box.className = 'heroIt';
  [...hero.children].forEach((c) => box.appendChild(c));
  place(box, 0, 0.9, -10, 0, true);
}
z = -26;
let side = 1;
function lane() { side = -side; return side; }
const halfW = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
function harvest(sec) {
  const wrap = $('.wrap', sec);
  const head = document.createElement('div'); head.className = 'hudBlock';
  const stuff = [];
  [...wrap.children].forEach((c) => {
    if (c.matches('.kick,h2,.lead') || (c.tagName === 'A' && c.querySelector('h2'))) head.appendChild(c);
    else stuff.push(c);
  });
  sections.push({ id: sec.id, z0: z + 6, head });
  const small = [], step = mobile ? 3.8 : 3.6;
  const flushSmall = () => {
    small.splice(0).forEach((el, i) => {
      const s = lane(), w = (el.classList.contains('big') ? 6.4 : el.classList.contains('card') ? 4.6 : 3.8);
      const off = mobile ? 0.9 : 1.8 + (i % 2) * 0.4;
      place(el, s * (w / 2 + off), ((i * 37) % 5 - 2) * 0.32, z, -s * 0.2);
      z -= step;
    });
  };
  const wideIt = (el) => { flushSmall(); z -= 4; place(el, (lane() * 0.35), 0.1, z, 0, true); z -= 12; };
  stuff.forEach((c) => {
    if (c.matches('#grid')) { [...c.children].forEach((k) => small.push(k)); }
    else if (c.matches('.tools')) { [...c.children].forEach((k) => small.push(k)); }
    else if (c.matches('.feat,.about,.more')) wideIt(c);
    else small.push(c);
  });
  if (sec.id === 'contact') { const box = document.createElement('div'); box.className = 'contactIt'; stuff.forEach((c) => box.appendChild(c)); }
  flushSmall();
  z -= 10;
}
function build() {
  ['work', 'tools', '3d', 'lab', 'about'].forEach((id) => harvest(document.getElementById(id)));
  // contato: o bloco inteiro é uma janela no fim
  const ct = $('#contact .wrap');
  const head = document.createElement('div'); head.className = 'hudBlock';
  sections.push({ id: 'contact', z0: z + 6, head });
  const box = document.createElement('div'); box.className = 'contactIt';
  [...ct.children].forEach((c) => box.appendChild(c));
  const ft = $('footer .wrap'); if (ft) { const f = document.createElement('div'); f.className = 'footIt'; [...ft.children].forEach((c) => f.appendChild(c)); box.appendChild(f); }
  z -= 4; place(box, 0, 0.3, z, 0, true);
  z += 7;   // a câmera para na frente do contato
  document.documentElement.classList.add('v2ready');
}

// ---------- postais ao longe ----------
const cards = [];
function buildPostcards(depth) {
  const geo = new THREE.PlaneGeometry(1, 1), gap = depth / Math.max(1, PCS.length);
  PCS.forEach((url, i) => {
    const a = i * 2.39996 + 0.6, r = (mobile ? 7 : 11) + (i % 3) * 2.2;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    const w = mobile ? 3.4 : 5.2;
    m.scale.set(w, w / 1.75, 1);
    m.position.set(Math.cos(a) * r * 1.2, Math.sin(a) * r * 0.62, -i * gap - 4);
    m.rotation.set(Math.sin(a) * 0.1, -Math.cos(a) * 0.25, (Math.random() - 0.5) * 0.08);
    m.userData = { url, by: m.position.y, ph: Math.random() * 6.28, rz: m.rotation.z, loaded: false };
    scene.add(m); cards.push(m);
  });
}
let next = 0, busy = 0;
function pump() {
  while (busy < 3 && next < cards.length) {
    const m = cards[next++]; busy++;
    tl.load(m.userData.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      m.scale.y = m.scale.x / (t.image.width / t.image.height);
      m.material.map = t; m.material.needsUpdate = true; m.userData.loaded = true; busy--; pump();
    }, undefined, () => { busy--; pump(); });
  }
}

// ---------- HUD (títulos parados no topo) ----------
const hud = document.createElement('div'); hud.id = 'hud'; document.body.appendChild(hud);
let curSec = null;
function setHud(s) {
  if (s === curSec) return; curSec = s;
  hud.classList.remove('on');
  setTimeout(() => { hud.innerHTML = ''; if (s) { hud.appendChild(s.head); hud.classList.add('on'); } }, 260);
}

// ---------- rolagem ----------
let DEPTH = 1;
const spacer = document.createElement('div'); spacer.id = 'spacer'; document.body.appendChild(spacer);
const camZ = () => -scrollY / PXU;
let cz = 0;
addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/v2/#"]'); if (!a) return;
  const id = a.getAttribute('href').slice(5);
  e.preventDefault();
  if (!id || id === 'top') return scrollTo({ top: 0, behavior: 'smooth' });
  const s = sections.find((x) => x.id === id);
  if (s) scrollTo({ top: Math.max(0, -(s.z0 + 4) * PXU), behavior: 'smooth' });
});

// ---------- mouse ----------
let mx = 0, my = 0, tx = 0, ty = 0;
addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

function size() {
  const w = innerWidth, h = innerHeight;
  gl.setSize(w, h, false); css.setSize(w, h);
  camera.aspect = bgCam.aspect = w / h;
  camera.fov = (w / h < 1) ? 72 : 55;
  camera.updateProjectionMatrix(); bgCam.updateProjectionMatrix();
}
addEventListener('resize', size);

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const t = clock.getElapsedTime();
  mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
  cz += (camZ() - cz) * 0.09;
  camera.position.set(mx * 0.9, -my * 0.55, cz);
  camera.lookAt(mx * 0.25, -my * 0.15, cz - 30);
  // fundo: quase parado, só gira de leve com o mouse e com a viagem
  bgCam.rotation.set(-my * 0.04, -mx * 0.06 + cz * 0.0004, 0);
  earth.rotation.y += 0.00025; halo.rotation.y = earth.rotation.y;

  // conteúdo: aparece ao longe, passa por você e some atrás
  for (const it of items) {
    const d = cz - it.o.position.z;            // distância à frente
    const near = it.wide ? sm(1.2, 6.5, d) : sm(0.4, 2.6, d);
    const far = it.wide ? 1 - sm(30, 46, d) : 1 - sm(20, 32, d);
    const a = Math.min(near, far);
    if (a < 0.01) { if (it.el.style.display !== 'none') it.el.style.display = 'none'; continue; }
    if (it.el.style.display === 'none') it.el.style.display = '';
    it.el.style.opacity = a.toFixed(3);
  }
  for (const m of cards) {
    const u = m.userData, d = cz - m.position.z;
    m.position.y = u.by + Math.sin(t * 0.6 + u.ph) * 0.15;
    m.rotation.z = u.rz + Math.sin(t * 0.4 + u.ph) * 0.02;
    const target = u.loaded ? Math.min(sm(0.5, 4, d), 1 - sm(55, 95, d)) : 0;
    m.material.opacity += (target - m.material.opacity) * 0.08;
    m.visible = m.material.opacity > 0.01;
  }
  // título da seção atual
  let s = null; for (const x of sections) if (cz <= x.z0) s = x;
  setHud(s);

  gl.clear();
  gl.render(bg, bgCam);
  gl.clearDepth();
  gl.render(scene, camera);
  css.render(cssScene, camera);
}

function start() {
  build();
  DEPTH = -z;
  spacer.style.height = Math.round(DEPTH * PXU + innerHeight) + 'px';
  buildPostcards(DEPTH);
  pump();
  size();
  cz = camZ();
  frame();
}
// o grid de trabalhos vem do works.json: espera ele montar
(function wait(n) {
  if ($$('#grid .card').length || n > 60) start(); else setTimeout(() => wait(n + 1), 100);
})(0);
