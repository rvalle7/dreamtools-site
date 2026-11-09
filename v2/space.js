// Dreamtools v2 — em órbita. A Terra grande em arco, o sol na borda, postais orbitando e vindo
// na nossa direção (sempre, mesmo parado); a rolagem leva a câmera pelos trabalhos e ferramentas.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { craftIcon } from './crafts.js';

const PCS = window.DT_PCS || [];
const mobile = matchMedia('(max-width: 760px)').matches;
const PX = 0.01;              // 1 px do HTML = 0,01 unidade
const PXU = mobile ? 70 : 85; // px de rolagem por unidade de profundidade
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- renderizadores ----------
const gl = new THREE.WebGLRenderer({ canvas: $('#space'), antialias: !mobile, powerPreference: 'high-performance' });
gl.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
gl.outputColorSpace = THREE.SRGBColorSpace;
const css = new CSS3DRenderer();
css.domElement.id = 'css3d';
document.body.appendChild(css.domElement);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
const cssScene = new THREE.Scene();

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
      vec3 n=texture2D(nightT,vUv).rgb; n=pow(n,vec3(1.25))*vec3(2.4,1.9,1.3);
      vec3 col=mix(n+d*0.012, d*(0.25+0.9*max(l,0.)), day);
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
addSun(radial([[0, 'rgba(255,180,90,.55)'], [0.25, 'rgba(255,110,30,.22)'], [1, 'rgba(255,80,20,0)']]), 900);
addSun(radial([[0, 'rgba(255,240,210,1)'], [0.18, 'rgba(255,195,110,.9)'], [0.45, 'rgba(255,125,35,.35)'], [1, 'rgba(255,100,30,0)']]), 240);
addSun(radial([[0, 'rgba(255,255,245,1)'], [0.4, 'rgba(255,232,185,.9)'], [1, 'rgba(255,200,120,0)']]), 52);
addSun(radial([[0, 'rgba(255,185,110,.55)'], [1, 'rgba(255,140,50,0)']]), 30, 40);

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

// postais em órbita: anéis em volta da Terra que passam pela câmera — vêm de trás do horizonte até nós
const orbit = [];
const pgeo = new THREE.PlaneGeometry(1, 1);
let pNext = 0, pBusy = 0;
function buildOrbit() {
  const n = PCS.length;
  PCS.forEach((url, i) => {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(pgeo, mat);
    const w = mobile ? 26 : 34;
    m.scale.set(w, w / 1.75, 1);
    m.userData = {
      url, loaded: false,
      phi: -Math.PI + (i / n) * Math.PI * 2,   // espalhados pelo anel
      tilt: (Math.random() - 0.5) * 0.9,       // inclinação do anel
      rk: 0.86 + Math.random() * 0.12,         // raio do anel / distância da câmera
      lat: (Math.random() * 1.4 - 0.9),        // desvio lateral (mais para baixo)
      lx: (Math.random() - 0.35) * 1.2,
      rz: (Math.random() - 0.5) * 0.25,
    };
    bg.add(m); orbit.push(m);
  });
}
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
const _u = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3();
function orbitPos(u, out) {
  const E = earth.position, D = E.length();
  _u.copy(E).multiplyScalar(-1 / D);                        // da Terra para a câmera
  _v.set(0, 1, 0).sub(_w.copy(_u).multiplyScalar(_u.y)).normalize(); // "para cima" no plano
  _w.crossVectors(_u, _v);                                  // lateral
  const a = u.tilt, vx = _v.x * Math.cos(a) + _w.x * Math.sin(a), vy = _v.y * Math.cos(a) + _w.y * Math.sin(a), vz = _v.z * Math.cos(a) + _w.z * Math.sin(a);
  const r = D * u.rk;
  out.set(E.x + r * (Math.cos(u.phi) * _u.x + Math.sin(u.phi) * vx), E.y + r * (Math.cos(u.phi) * _u.y + Math.sin(u.phi) * vy), E.z + r * (Math.cos(u.phi) * _u.z + Math.sin(u.phi) * vz));
  // afasta do eixo da câmera, mais para baixo e para os lados
  const f = sm(-1.2, 0, u.phi) * (1 - sm(0, 0.3, u.phi));
  out.addScaledVector(_v, u.lat * 70 * f).addScaledVector(_w, u.lx * 90 * f);
  return out;
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

// ---------- conteúdo: capa e seções viram objetos 3D ----------
const items = [], sections = [];
function place(el, x, y, z, ry = 0, wide = false) {
  el.classList.add('it');
  const o = new CSS3DObject(el);
  o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(PX);
  cssScene.add(o); items.push({ o, el, z, wide });
  return o;
}
let z = 0;
{
  const hero = $('header.hero .wrap');
  const box = document.createElement('div'); box.className = 'heroIt';
  [...hero.children].forEach((c) => box.appendChild(c));
  place(box, 0, 1.25, -10, 0, true);
}
// leque em volta do caminho, sem usar o topo (é do título)
const FAN = [-150, -28, -95, 168, 12, -125, -58, 192, -8, -112, -70, 158, 22, -140, -40];
let fi = 0;
function harvest(sec) {
  const wrap = $('.wrap', sec);
  const head = document.createElement('div'); head.className = 'hudBlock';
  const stuff = [];
  [...wrap.children].forEach((c) => {
    if (c.matches('.kick,h2,.lead') || (c.tagName === 'A' && c.querySelector('h2'))) head.appendChild(c);
    else stuff.push(c);
  });
  sections.push({ id: sec.id, z0: z + 18, head });
  const small = [];
  const flushSmall = () => {
    small.splice(0).forEach((el) => {
      const a = FAN[fi++ % FAN.length] * Math.PI / 180;
      const big = el.classList.contains('big');
      const rx = (mobile ? 2.2 : 4.9) * (big ? 1.1 : 1), ry = mobile ? 2.6 : 2.15;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry - 0.35;
      place(el, x, y, z, -Math.sign(x) * 0.16);
      z -= mobile ? 3.4 : 2.7;
    });
  };
  const wideIt = (el) => { flushSmall(); z -= 4; place(el, 0, -0.3, z, 0, true); z -= 12; };
  stuff.forEach((c) => {
    if (c.matches('#grid,.tools')) [...c.children].forEach((k) => small.push(k));
    else if (c.matches('.feat,.about,.more')) wideIt(c);
    else small.push(c);
  });
  flushSmall();
  z -= 10;
}
function build() {
  z = -44;   // os trabalhos só aparecem depois de sair da capa
  ['work', 'tools', '3d', 'lab', 'about'].forEach((id) => harvest(document.getElementById(id)));
  const ct = $('#contact .wrap');
  const head = document.createElement('div'); head.className = 'hudBlock';
  sections.push({ id: 'contact', z0: z + 12, head });
  const box = document.createElement('div'); box.className = 'contactIt';
  [...ct.children].forEach((c) => box.appendChild(c));
  const ft = $('footer .wrap'); if (ft) { const f = document.createElement('div'); f.className = 'footIt'; [...ft.children].forEach((c) => f.appendChild(c)); box.appendChild(f); }
  z -= 4; place(box, 0, 0.3, z, 0, true);
  z += 7;
  document.documentElement.classList.add('v2ready');
}

// ---------- HUD (título da seção parado no topo, entra com zoom) ----------
const hud = document.createElement('div'); hud.id = 'hud'; document.body.appendChild(hud);
let curSec;
function setHud(s) {
  if (s === curSec) return; curSec = s;
  hud.classList.remove('on');
  setTimeout(() => { hud.innerHTML = ''; if (s) { hud.appendChild(s.head); requestAnimationFrame(() => hud.classList.add('on')); } }, 280);
}

// ---------- som: ambiente espacial + vídeo do card com som 3D ----------
const audio = { ctx: null, on: true, master: null, amb: null, cur: null };
try { audio.on = localStorage.getItem('dt-sound') !== '0'; } catch {}
const sndBtn = $('#snd-btn');
function paintSnd() { if (sndBtn) { sndBtn.classList.toggle('off', !audio.on); sndBtn.setAttribute('aria-pressed', audio.on ? 'true' : 'false'); } }
paintSnd();
function startAudio() {
  if (audio.ctx || !audio.on) return;
  const C = new (window.AudioContext || window.webkitAudioContext)(); audio.ctx = C; sndBtn && sndBtn.classList.add('live');
  const master = C.createGain(); master.gain.value = 0; master.connect(C.destination); audio.master = master;
  master.gain.linearRampToValueAtTime(1, C.currentTime + 2.5);
  const amb = C.createGain(); amb.gain.value = 0.9; amb.connect(master); audio.amb = amb;
  // zumbido grave que respira
  const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.6; lp.connect(amb);
  [[55, 0.05], [82.6, 0.035], [110.4, 0.015]].forEach(([f, g]) => { const o = C.createOscillator(); o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12; const gg = C.createGain(); gg.gain.value = g; o.connect(gg).connect(lp); o.start(); });
  const lfo = C.createOscillator(); lfo.frequency.value = 0.05; const lg = C.createGain(); lg.gain.value = 160; lfo.connect(lg).connect(lp.frequency); lfo.start();
  // vento de ruído filtrado
  const buf = C.createBuffer(1, C.sampleRate * 3, C.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const ns = C.createBufferSource(); ns.buffer = buf; ns.loop = true;
  const bp = C.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8;
  const ng = C.createGain(); ng.gain.value = 0.012; ns.connect(bp).connect(ng).connect(amb); ns.start();
  const l2 = C.createOscillator(); l2.frequency.value = 0.07; const l2g = C.createGain(); l2g.gain.value = 260; l2.connect(l2g).connect(bp.frequency); l2.start();
  // eco para os pings (sonar de satélite)
  const dl = C.createDelay(2); dl.delayTime.value = 0.42; const fb = C.createGain(); fb.gain.value = 0.42; const dlp = C.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
  dl.connect(dlp).connect(fb).connect(dl); const pan = C.createStereoPanner(); dlp.connect(pan).connect(amb);
  function ping() {
    if (!audio.ctx) return;
    const t = C.currentTime, o = C.createOscillator(), g = C.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime([1318, 1568, 987.8, 2093][Math.floor(Math.random() * 4)], t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.4);
    pan.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g); g.connect(dl); g.connect(amb); o.start(t); o.stop(t + 1.6);
    setTimeout(ping, 5000 + Math.random() * 9000);
  }
  setTimeout(ping, 2500);
}
function setSound(on) {
  audio.on = on; paintSnd();
  try { localStorage.setItem('dt-sound', on ? '1' : '0'); } catch {}
  if (on) { startAudio(); if (audio.ctx) { audio.ctx.resume(); audio.master.gain.setTargetAtTime(1, audio.ctx.currentTime, 0.4); } }
  else if (audio.ctx) { audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.2); if (audio.cur) stopCard(audio.cur, true); }
}
sndBtn && sndBtn.addEventListener('click', (e) => { e.stopPropagation(); setSound(!audio.on); });
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, () => { if (audio.on) { startAudio(); audio.ctx && audio.ctx.resume(); } }, { passive: true }));

// vídeo do card: parar o mouse em cima toca o filme completo com som; o som acompanha a posição do card
let FULL = {};
audio.cors = false;
fetch('/works.json', { cache: 'no-cache' }).then((r) => r.json()).then((w) => {
  w.forEach((x) => { if (x.full) FULL[x.id] = x.full; });
  // o Dropbox deixa ler o som pelo WebAudio (CORS)? Se não, o som vai só pelo volume do vídeo
  const u = Object.values(FULL)[0];
  if (u) fetch(u, { mode: 'cors', headers: { Range: 'bytes=0-1' } }).then((r) => { audio.cors = r.ok; }).catch(() => { audio.cors = false; });
}).catch(() => {});
function cardSound(card) {
  const v = card.querySelector('video'); if (!v || !audio.ctx || !audio.on) return null;
  if (!card._snd) {
    const C = audio.ctx, g = C.createGain(), p = C.createStereoPanner(); g.gain.value = 0; p.connect(audio.master); g.connect(p);
    card._snd = { g, p, src: null, cors: true };
  }
  return card._snd;
}
function playCard(card) {
  const full = FULL[card.dataset.id]; const s = cardSound(card); if (!full || !s) return;
  if (audio.cur && audio.cur !== card) stopCard(audio.cur);
  audio.cur = card;
  const v = card.querySelector('video');
  card._loop = card._loop || v.dataset.src;
  v.pause();
  s.volOnly = !audio.cors;
  if (audio.cors) { v.crossOrigin = 'anonymous'; if (!s.src) { try { s.src = audio.ctx.createMediaElementSource(v); s.src.connect(s.g); } catch { s.volOnly = true; } } }
  v.muted = false; v.volume = s.volOnly ? 0 : 1; v.loop = true; v.src = full;
  v.play().then(() => card.classList.add('play')).catch(() => {});
  const C = audio.ctx;
  s.g.gain.cancelScheduledValues(C.currentTime); s.g.gain.setTargetAtTime(0.9, C.currentTime, 0.35);
  audio.amb.gain.setTargetAtTime(0.25, C.currentTime, 0.5);   // o ambiente abaixa
  card.classList.add('snd');
}
function stopCard(card, now) {
  const s = card._snd; const v = card.querySelector('video'); if (!s || !v) return;
  const C = audio.ctx;
  s.g.gain.setTargetAtTime(0, C.currentTime, now ? 0.05 : 0.3);
  if (audio.cur === card) { audio.cur = null; audio.amb.gain.setTargetAtTime(0.9, C.currentTime, 0.8); }
  card.classList.remove('snd');
  clearTimeout(card._back);
  card._back = setTimeout(() => { if (audio.cur === card) return; v.pause(); v.muted = true; v.src = card._loop; v.loop = true; v.load(); card.classList.remove('play'); }, now ? 60 : 1100);
}
function wireCards() {
  $$('.card.it').forEach((card) => {
    let tm;
    card.addEventListener('mouseenter', () => { clearTimeout(tm); tm = setTimeout(() => playCard(card), 380); });
    card.addEventListener('mouseleave', () => { clearTimeout(tm); if (audio.cur === card) stopCard(card); });
  });
}

// ---------- rolagem, mouse, tela cheia ----------
let DEPTH = 1;
const spacer = document.createElement('div'); spacer.id = 'spacer'; document.body.appendChild(spacer);
const camZ = () => -scrollY / PXU;
let cz = 0, lastZ = 0, vel = 0;
addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="/v2/#"]'); if (!a) return;
  const id = a.getAttribute('href').slice(5); e.preventDefault();
  if (!id || id === 'top') return scrollTo({ top: 0, behavior: 'smooth' });
  const s = sections.find((x) => x.id === id);
  if (s) scrollTo({ top: Math.max(0, -(s.z0 - 10) * PXU), behavior: 'smooth' });
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
  gl.setSize(w, h, false); css.setSize(w, h);
  camera.aspect = bgCam.aspect = w / h;
  camera.fov = (w / h < 1) ? 72 : 55;
  camera.updateProjectionMatrix(); bgCam.updateProjectionMatrix();
  placeEarth();
}
addEventListener('resize', size);

const clock = new THREE.Clock();
const _q = new THREE.Vector3(), _q2 = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  mx += (tx - mx) * 0.05; my += (ty - my) * 0.05;
  cz += (camZ() - cz) * 0.09;
  vel += (Math.abs(cz - lastZ) / Math.max(dt, 0.001) - vel) * 0.1; lastZ = cz;
  camera.position.set(mx * 0.9, -my * 0.55, cz);
  camera.lookAt(mx * 0.25, -my * 0.15, cz - 30);

  // fundo: a câmera do fundo só olha de leve com o mouse
  bgCam.rotation.set(-my * 0.035, -mx * 0.05, 0);
  earth.rotation.y += dt * 0.006; halo.rotation.y = earth.rotation.y;
  sky.rotation.y += dt * 0.0035; sky.rotation.x = 0.25;
  sky.userData.mat.uniforms.t.value = t;
  for (const s of sky.userData.big) { const u = s.userData, k = u.k * (0.78 + 0.22 * Math.sin(t * 0.85 + u.ph)); s.scale.set(k, k, 1); }

  // postais: giram sempre; a rolagem acelera
  const w = 0.022 + Math.min(0.25, vel * 0.012);
  for (const m of orbit) {
    const u = m.userData;
    u.phi += w * dt; if (u.phi > 0.35) u.phi -= Math.PI * 2;
    orbitPos(u, m.position);
    m.lookAt(bgCam.position); m.rotateZ(u.rz);
    const dc = m.position.length();
    const target = u.loaded ? Math.min(sm(30, 110, dc), sm(-Math.PI, -2.3, u.phi)) : 0;
    m.material.opacity += (target - m.material.opacity) * 0.06;
    m.visible = m.material.opacity > 0.01;
  }
  // naves
  for (const s of crafts) {
    const u = s.userData; u.ph += u.sp * dt;
    const r = R * u.sh, a = u.ph;
    _q.set(Math.cos(a) * r, Math.sin(a) * Math.sin(u.inc) * r, Math.sin(a) * Math.cos(u.inc) * r).add(earth.position);
    _q2.set(-Math.sin(a) * r, Math.cos(a) * Math.sin(u.inc) * r, Math.cos(a) * Math.cos(u.inc) * r).add(earth.position);
    s.position.copy(_q);
    const k = u.sz * (s.position.length() / 600) * 0.26; s.scale.set(k, k, 1);
    const p1 = _q.clone().project(bgCam), p2 = _q2.clone().multiplyScalar(0.0).add(_q).addScaledVector(_q2.sub(earth.position).normalize(), 5).project(bgCam);
    s.material.rotation = Math.atan2((p2.y - p1.y), (p2.x - p1.x) * bgCam.aspect);
  }

  // conteúdo: aparece ao longe, passa por você e some
  for (const it of items) {
    const d = cz - it.o.position.z;
    const near = it.wide ? sm(1.2, 6.5, d) : sm(0.6, 2.8, d);
    const far = it.wide ? 1 - sm(28, 44, d) : 1 - sm(17, 27, d);
    const a = Math.min(near, far);
    if (a < 0.01) { if (it.el.style.display !== 'none') it.el.style.display = 'none'; continue; }
    if (it.el.style.display === 'none') it.el.style.display = '';
    it.el.style.opacity = a.toFixed(3);
  }
  // som do card acompanha a posição dele na tela e a distância
  if (audio.cur && audio.cur._snd) {
    const r = audio.cur.getBoundingClientRect(), C = audio.ctx;
    const px = Math.max(-1, Math.min(1, ((r.left + r.width / 2) / innerWidth) * 2 - 1));
    audio.cur._snd.p.pan.setTargetAtTime(px * 0.85, C.currentTime, 0.1);
    const op = +audio.cur.style.opacity || 1;
    const vol = Math.min(1, Math.max(0, r.width / (innerWidth * 0.45))) * op;
    if (audio.cur._snd.volOnly) audio.cur.querySelector('video').volume = Math.min(1, vol);
    else audio.cur._snd.g.gain.setTargetAtTime(0.9 * Math.min(1, vol), C.currentTime, 0.15);
    if (op < 0.05) stopCard(audio.cur);
  }
  let s = null; for (const x of sections) if (cz <= x.z0) s = x;
  setHud(s);

  gl.render(bg, bgCam);
  css.render(cssScene, camera);
}

function start() {
  build();
  DEPTH = -z;
  spacer.style.height = Math.round(DEPTH * PXU + innerHeight) + 'px';
  size();
  buildOrbit(); pump();
  wireCards();
  cz = lastZ = camZ();
  frame();
}
(function wait(n) { if ($$('#grid .card').length || n > 60) start(); else setTimeout(() => wait(n + 1), 100); })(0);
