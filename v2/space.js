// Dreamtools v2 — em órbita. Uma perspectiva só: a da Terra. Postais e conteúdo correm numa órbita
// que vai de perto da câmera até o horizonte, junto do sol. A Terra gira sozinha, como fundo.
import * as THREE from 'three';
import { craftIcon } from './crafts.js';

const PCS = window.DT_PCS || [];
const mobile = matchMedia('(max-width: 760px)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const gl = new THREE.WebGLRenderer({ canvas: $('#space'), antialias: !mobile, powerPreference: 'high-performance' });
gl.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
gl.outputColorSpace = THREE.SRGBColorSpace;
// conteúdo em HTML de verdade (camada 2D por cima): cada item é posicionado pela projeção da câmera,
// assim o clique e o mouse funcionam normalmente
const layer = document.createElement('div'); layer.id = 'css3d'; document.body.appendChild(layer);

// ---------- fundo: céu, Terra, sol, postais e naves em órbita ----------
const bg = new THREE.Scene();
const bgCam = new THREE.PerspectiveCamera(40, 1, 0.5, 4000);
const tl = new THREE.TextureLoader();
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function radial(stops) {
  return canvasTex(256, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
}

// céu: três tamanhos de estrela que piscam, e algumas grandes com brilho e 6 raios; gira devagar
const sky = new THREE.Group(); bg.add(sky);
{
  const n = mobile ? 1600 : 3200, p = new Float32Array(n * 3), m = new Float32Array(n), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2000);
    p.set([v.x, v.y, v.z], i * 3);
    const r = Math.random(); m[i] = r > 0.985 ? 1 : r > 0.9 ? 0.7 : r > 0.55 ? 0.45 : 0.25; ph[i] = Math.random() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('mag', new THREE.BufferAttribute(m, 1));
  g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { t: { value: 0 }, dpr: { value: gl.getPixelRatio() } },
    vertexShader: `attribute float mag; attribute float ph; uniform float t; uniform float dpr; varying float vA;
      void main(){ vA=(0.45+0.55*mag)*(0.72+0.28*sin(t*1.7+ph)); gl_PointSize=(1.1+mag*2.6)*dpr; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.; float a=smoothstep(1.,0.2,d); gl_FragColor=vec4(vec3(0.92,0.95,1.)*a*vA,1.); }`,
  });
  sky.add(new THREE.Points(g, mat));
  sky.userData.mat = mat;
  // estrelas grandes com halo e raios
  const flare = canvasTex(256, (g, s) => {
    const c = s / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(240,246,255,1)'); gr.addColorStop(0.05, 'rgba(230,240,255,.9)'); gr.addColorStop(0.18, 'rgba(190,210,250,.25)'); gr.addColorStop(1, 'rgba(180,200,245,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, x = Math.cos(a), y = Math.sin(a);
      const lg = g.createLinearGradient(c, c, c + x * c, c + y * c);
      lg.addColorStop(0, 'rgba(236,244,255,.85)'); lg.addColorStop(1, 'rgba(236,244,255,0)');
      g.strokeStyle = lg; g.lineWidth = 2.2; g.beginPath(); g.moveTo(c, c); g.lineTo(c + x * c * 0.95, c + y * c * 0.95); g.stroke();
    }
  });
  sky.userData.big = [];
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
    s.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(1900));
    const k = 18 + Math.random() * 46; s.scale.set(k, k, 1); s.userData = { k, ph: Math.random() * 6.28 };
    sky.add(s); sky.userData.big.push(s);
  }
}

// Terra (dia, noite com luzes das cidades, crepúsculo e atmosfera)
const SUN = new THREE.Vector3();
const earthMat = new THREE.ShaderMaterial({
  uniforms: { dayT: { value: null }, nightT: { value: null }, sun: { value: SUN } },
  vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal);
      vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform sampler2D dayT; uniform sampler2D nightT; uniform vec3 sun;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      vec3 N=normalize(vN); float l=dot(N,sun);
      float day=smoothstep(-0.10,0.28,l);
      vec3 d=texture2D(dayT,vUv).rgb*1.12;
      vec3 n=texture2D(nightT,vUv).rgb; n=pow(n,vec3(2.1))*vec3(2.6,2.0,1.3);
      vec3 col=mix(n+d*0.02, d*(0.25+0.9*max(l,0.)), day);
      float rim=pow(1.-max(dot(N,vV),0.),5.0);
      float lit=smoothstep(-0.35,0.5,l);
      float s=pow(max(dot(-vV,sun),0.),60.);
      col+=mix(vec3(0.08,0.2,0.55),vec3(1.0,0.55,0.2),s)*rim*(0.35+2.5*lit);
      col+=vec3(1.0,0.45,0.15)*exp(-pow(l*7.,2.))*0.15;
      gl_FragColor=vec4(col,1.);
      #include <colorspace_fragment>
    }`,
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), earthMat);
earth.rotation.set(0.35, -1.2, 0.41);
bg.add(earth);
const halo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 120, 80), new THREE.ShaderMaterial({
  uniforms: { sun: { value: SUN } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 w=modelMatrix*vec4(position,1.); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 sun; varying vec3 vN; varying vec3 vV;
    void main(){ float e=pow(1.-abs(dot(vN,vV)),6.); float s=pow(max(dot(-vV,sun),0.),40.);
      vec3 c=mix(vec3(0.2,0.45,1.0),vec3(1.0,0.6,0.25),s); gl_FragColor=vec4(c*e*(0.35+2.2*s),1.); }`,
}));
bg.add(halo);
tl.load('/v2/tex/earth-day.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; earthMat.uniforms.dayT.value = t; });
tl.load('/v2/tex/earth-night.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; earthMat.uniforms.nightT.value = t; });

// sol dourado/laranja com risco anamórfico
const sunGroup = new THREE.Group(); bg.add(sunGroup);
const addSun = (map, s, sx = 1) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })); m.scale.set(s * sx, s, 1); sunGroup.add(m); return m; };
addSun(radial([[0, 'rgba(255,180,90,.5)'], [0.25, 'rgba(255,110,30,.18)'], [1, 'rgba(255,80,20,0)']]), 300);
addSun(radial([[0, 'rgba(255,240,210,1)'], [0.18, 'rgba(255,195,110,.9)'], [0.45, 'rgba(255,125,35,.35)'], [1, 'rgba(255,100,30,0)']]), 80);
addSun(radial([[0, 'rgba(255,255,245,1)'], [0.4, 'rgba(255,232,185,.9)'], [1, 'rgba(255,200,120,0)']]), 18);
addSun(radial([[0, 'rgba(255,185,110,.55)'], [1, 'rgba(255,140,50,0)']]), 10, 36);

// posição da Terra pela tela: centro fora do quadro, embaixo à esquerda; a borda passa por LIMB; o sol fica logo além
const EARTH_C = new THREE.Vector2(-1.55, -1.75), LIMB = new THREE.Vector2(-0.12, -0.18), DIST = 600;
let R = 100;
function ndcDir(v) { return new THREE.Vector3(v.x, v.y, 0.5).unproject(bgCam).sub(bgCam.position).normalize(); }
function placeEarth() {
  bgCam.rotation.set(0, 0, 0); bgCam.updateMatrixWorld();
  const c = ndcDir(EARTH_C), l = ndcDir(LIMB);
  const th = c.angleTo(l);
  R = DIST * Math.sin(th);
  earth.position.copy(c).multiplyScalar(DIST); earth.scale.setScalar(R);
  halo.position.copy(earth.position); halo.scale.setScalar(R);
  const axis = new THREE.Vector3().crossVectors(c, l).normalize();
  SUN.copy(c).applyAxisAngle(axis, th * 1.045);
  sunGroup.position.copy(SUN).multiplyScalar(3000);
  const k = 3000 / 700; sunGroup.scale.setScalar(k);
}

// naves e satélites (os mesmos ícones do mapa) em órbita baixa
const crafts = [];
{
  const list = [['iss', 1.10, 0.9, 64], ['hubble', 1.14, 2.1, 30], ['starship', 1.18, 3.7, 58], ['dragon', 1.12, 5.0, 26], ['sputnik', 1.08, 1.4, 34], ['tiangong', 1.13, 4.4, 30], ['starlink', 1.11, 0.2, 22]];
  list.forEach(([k, sh, ph, sz], i) => {
    const c = craftIcon[k]; if (!c) return;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false }));
    s.userData = { sh, ph, sz, inc: (i * 0.7) % 2.2 - 1.1, sp: 0.018 + (i % 3) * 0.004 };
    bg.add(s); crafts.push(s);
  });
}

// ---------- a órbita: de perto (S) até o horizonte (H), contornando a Terra ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Vector3();
function ndcPoint(nx, ny, dist, out = new THREE.Vector3()) { return out.copy(ndcDir(new THREE.Vector2(nx, ny))).multiplyScalar(dist); }
function orbitAt(S, H, t, out) {
  const E = earth.position;
  _a.copy(S).sub(E); _b.copy(H).sub(E);
  const la = _a.length(), lb = _b.length();
  _a.normalize(); _b.normalize();
  _q.setFromUnitVectors(_a, _b);
  const q = new THREE.Quaternion().slerp(_q, t);   // identidade → rotação total
  _c.copy(_a).applyQuaternion(q).multiplyScalar(la + (lb - la) * t);
  return out.copy(E).add(_c);
}
function horizon(spread, out) {           // um ponto logo além da borda da Terra, perto do sol
  const n = new THREE.Vector2(LIMB.x + spread * 0.55, LIMB.y - spread * 0.2);
  return ndcPoint(n.x, n.y, earth.position.length() * 1.02, out);
}

// ---------- postais: sempre correndo pela órbita (a rolagem acelera) ----------
const orbit = [];
const pgeo = new THREE.PlaneGeometry(1, 1);
let pNext = 0, pBusy = 0;
function buildOrbit() {
  const n = PCS.length;
  PCS.forEach((url, i) => {
    const m = new THREE.Mesh(pgeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    const w = mobile ? 22 : 30;
    m.scale.set(w, w / 1.75, 1);
    let nx, ny; do { nx = Math.random() * 2.2 - 1.1; ny = Math.random() * 1.6 - 1.1; } while (ny > 0.25 && Math.abs(nx) < 0.55);
    m.userData = { url, loaded: false, t: i / n, sp: 0.75 + Math.random() * 0.5, nx, ny, d: 150 + Math.random() * 170, hs: Math.random() * 2 - 1, rz: (Math.random() - 0.5) * 0.2, S: new THREE.Vector3(), H: new THREE.Vector3() };
    bg.add(m); orbit.push(m);
  });
}
function laneOrbit() { for (const m of orbit) { const u = m.userData; ndcPoint(u.nx, u.ny, u.d, u.S); horizon(u.hs, u.H); } }
function pump() {
  while (pBusy < 3 && pNext < orbit.length) {
    const m = orbit[pNext++]; pBusy++;
    tl.load(m.userData.url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      m.scale.y = m.scale.x / (t.image.width / t.image.height);
      m.material.map = t; m.material.needsUpdate = true; m.userData.loaded = true; pBusy--; pump();
    }, undefined, () => { pBusy--; pump(); });
  }
}

// ---------- conteúdo: entra perto e vai para o horizonte conforme a rolagem ----------
const PX = mobile ? 0.07 : 0.1;
const items = [], sections = [];
let slot = 0;
function add(el, kind, nx, ny, d) {
  el.classList.add('it');
  layer.appendChild(el);
  const o = { position: new THREE.Vector3(), visible: false };
  const it = { o, el, kind, k: slot, nx, ny, d, S: new THREE.Vector3(), H: new THREE.Vector3(), hs: nx * 0.7, w: 0, h: 0 };
  items.push(it); return it;
}
const LANES = [[-0.5, -0.38], [0.5, -0.5], [0.05, -0.72], [-0.62, 0.02], [0.62, -0.02], [-0.25, -0.55], [0.3, -0.25]];
let li = 0;
function harvest(sec) {
  const wrap = $('.wrap', sec);
  const head = document.createElement('div'); head.className = 'hudBlock';
  const stuff = [];
  [...wrap.children].forEach((c) => {
    if (c.matches('.kick,h2,.lead') || (c.tagName === 'A' && c.querySelector('h2'))) head.appendChild(c);
    else stuff.push(c);
  });
  sections.push({ id: sec.id, k: slot - 0.15, head });
  const small = [];
  const flush = () => small.splice(0).forEach((el) => {
    const [nx, ny] = LANES[li++ % LANES.length];
    add(el, 'small', nx, ny, el.classList.contains('big') ? 150 : 125);
    slot += 0.34;
  });
  stuff.forEach((c) => {
    if (c.matches('#grid,.tools')) [...c.children].forEach((k) => small.push(k));
    else if (c.matches('.feat,.about,.more')) { flush(); slot += 0.2; add(c, 'wide', 0.05, -0.12, c.matches('.more') ? 160 : 175); slot += 0.75; }
    else small.push(c);
  });
  flush();
  slot += 0.5;
}
function build() {
  const hero = $('header.hero .wrap');
  const box = document.createElement('div'); box.className = 'heroIt';
  [...hero.children].forEach((c) => box.appendChild(c));
  slot = 0; add(box, 'hero', -0.02, 0.28, 175);
  slot = 0.85;   // os trabalhos só começam depois da capa
  ['work', 'tools', '3d', 'lab', 'about'].forEach((id) => harvest(document.getElementById(id)));
  const ct = $('#contact .wrap');
  sections.push({ id: 'contact', k: slot - 0.15, head: document.createElement('div') });
  const box2 = document.createElement('div'); box2.className = 'contactIt';
  [...ct.children].forEach((c) => box2.appendChild(c));
  const ft = $('footer .wrap'); if (ft) { const f = document.createElement('div'); f.className = 'footIt'; [...ft.children].forEach((c) => f.appendChild(c)); box2.appendChild(f); }
  add(box2, 'end', 0.02, 0.0, 170);
  document.documentElement.classList.add('v2ready');
}
function laneItems() { for (const it of items) { ndcPoint(it.nx, it.ny, it.d, it.S); horizon(it.hs, it.H); } }

// ---------- HUD (título parado no topo, entra com zoom) ----------
const hud = document.createElement('div'); hud.id = 'hud'; document.body.appendChild(hud);
let curSec;
function setHud(s) {
  if (s === curSec) return; curSec = s;
  hud.classList.remove('on');
  setTimeout(() => { hud.innerHTML = ''; if (s && s.head.childNodes.length) { hud.appendChild(s.head); requestAnimationFrame(() => hud.classList.add('on')); } }, 280);
}

// ---------- rolagem, mouse, tela cheia ----------
let FOCAL = 1000;
const SPAN = 1.15;               // quanto de rolagem leva para um item ir de perto ao horizonte
const PXS = mobile ? 900 : 1100; // px de rolagem por unidade de "slot"
const spacer = document.createElement('div'); spacer.id = 'spacer'; document.body.appendChild(spacer);
let P = 0, lastP = 0, vel = 0;
const scrollP = () => scrollY / PXS;
addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/v2/#"]'); if (!a) return;
  const id = a.getAttribute('href').slice(5); e.preventDefault();
  if (!id || id === 'top') return scrollTo({ top: 0, behavior: 'smooth' });
  const s = sections.find((x) => x.id === id);
  if (s) scrollTo({ top: Math.max(0, (s.k + 0.2) * PXS), behavior: 'smooth' });
});
let mx = 0, my = 0, tx = 0, ty = 0;
addEventListener('pointermove', (e) => { tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
{
  const b = $('#fs-btn'), root = document.documentElement;
  if (b) b.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else (root.requestFullscreen || root.webkitRequestFullscreen).call(root); });
  document.addEventListener('fullscreenchange', () => b && b.classList.toggle('on', !!document.fullscreenElement));
}
function size() {
  const w = innerWidth, h = innerHeight;
  gl.setSize(w, h, false);
  bgCam.aspect = w / h; bgCam.fov = (w / h < 1) ? 60 : 40; bgCam.updateProjectionMatrix();
  placeEarth(); laneOrbit(); laneItems();
  FOCAL = 0.5 * h / Math.tan(THREE.MathUtils.degToRad(bgCam.fov / 2));
  for (const it of items) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
}
addEventListener('resize', size);

// vídeos dos cards tocam (mudos) enquanto estão passando
function setPlaying(it, on) {
  const v = it.el.querySelector('video'); if (!v) return;
  if (on) { if (!v.src && v.dataset.src) v.src = v.dataset.src; if (v.paused) v.play().then(() => it.el.classList.add('play')).catch(() => {}); }
  else if (!v.paused) { v.pause(); }
}

const clock = new THREE.Clock();
const _x = new THREE.Vector3(), _y = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
  P += (scrollP() - P) * 0.08;
  vel += (Math.abs(P - lastP) / Math.max(dt, 0.001) - vel) * 0.1; lastP = P;

  bgCam.rotation.set(-my * 0.03, -mx * 0.045, 0);
  earth.rotation.y += dt * 0.006; halo.rotation.y = earth.rotation.y;
  sky.rotation.y += dt * 0.0035; sky.rotation.x = 0.25;
  sky.userData.mat.uniforms.t.value = t;
  for (const s of sky.userData.big) { const u = s.userData, k = u.k * (0.78 + 0.22 * Math.sin(t * 0.85 + u.ph)); s.scale.set(k, k, 1); }

  // postais: vão para o horizonte o tempo todo; a rolagem acelera
  const w = 0.016 + Math.min(0.5, vel * 0.25);
  for (const m of orbit) {
    const u = m.userData;
    u.t += w * u.sp * dt; if (u.t >= 1) u.t -= 1;
    orbitAt(u.S, u.H, u.t, m.position);
    m.lookAt(bgCam.position); m.rotateZ(u.rz);
    const target = u.loaded ? Math.min(sm(0, 0.12, u.t), 1 - sm(0.82, 1, u.t)) : 0;
    m.material.opacity += (target - m.material.opacity) * 0.08;
    m.visible = m.material.opacity > 0.01;
  }
  // naves
  for (const s of crafts) {
    const u = s.userData; u.ph += u.sp * dt;
    const r = R * u.sh, a = u.ph;
    _x.set(Math.cos(a) * r, Math.sin(a) * Math.sin(u.inc) * r, Math.sin(a) * Math.cos(u.inc) * r).add(earth.position);
    _y.set(-Math.sin(a), Math.cos(a) * Math.sin(u.inc), Math.cos(a) * Math.cos(u.inc)).multiplyScalar(8).add(_x);
    s.position.copy(_x);
    const k = u.sz * (s.position.length() / 600) * 0.26; s.scale.set(k, k, 1);
    const p1 = _x.clone().project(bgCam), p2 = _y.clone().project(bgCam);
    s.material.rotation = Math.atan2(p2.y - p1.y, (p2.x - p1.x) * bgCam.aspect);
  }
  // conteúdo (re-mede de vez em quando: imagens e vídeos mudam a altura)
  if (t - (frame.m || 0) > 1.2) { frame.m = t; for (const it of items) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; } }
  for (const it of items) {
    const tt = (P - it.k) / SPAN;
    const pre = it.kind === 'hero' ? 1 : sm(-0.06, 0.04, tt);           // entra com fade, já perto
    const a = Math.min(pre, 1 - sm(0.62, 0.95, tt));
    const vis = a > 0.01 && tt < 1;
    if (vis !== it.o.visible) { it.o.visible = vis; it.el.style.visibility = vis ? 'visible' : 'hidden'; }
    setPlaying(it, vis);
    if (!vis) continue;
    orbitAt(it.S, it.H, Math.max(0, tt), it.o.position);
    _x.copy(it.o.position).applyMatrix4(bgCam.matrixWorldInverse);
    const depth = -_x.z; if (depth < 1) { it.el.style.visibility = 'hidden'; it.o.visible = false; continue; }
    _y.copy(it.o.position).project(bgCam);
    const sx = (_y.x + 1) / 2 * innerWidth, sy = (1 - _y.y) / 2 * innerHeight;
    const sc = PX * FOCAL / depth;
    it.el.style.transform = `translate3d(${(sx - it.w / 2).toFixed(1)}px,${(sy - it.h / 2).toFixed(1)}px,0) scale(${sc.toFixed(4)})`;
    it.el.style.zIndex = String(100000 - Math.round(depth * 10));
    it.el.style.opacity = a.toFixed(3);
  }
  let s = null; for (const x of sections) if (P >= x.k) s = x;
  setHud(s);

  gl.render(bg, bgCam);
}

function start() {
  build();
  buildOrbit();
  size();
  spacer.style.height = Math.round((slot + SPAN * 0.45) * PXS + innerHeight) + 'px';
  pump();
  P = lastP = scrollP();
  frame();
}
(function wait(n) { if ($$('#grid .card').length || n > 60) start(); else setTimeout(() => wait(n + 1), 100); })(0);
