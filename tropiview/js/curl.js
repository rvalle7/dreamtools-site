// A folha que vira, desenhada em WebGL (three.js).
// A folha gira presa a dobradica e a ponta pega descola num cilindro, seguindo o mouse.
(function () {
  const SEG = 40;

  class Curl {
    constructor(host) {
      this.host = host;
      this.cv = document.createElement('canvas');
      this.cv.className = 'curl';
      host.appendChild(this.cv);
      this.r = new THREE.WebGLRenderer({ canvas: this.cv, alpha: true, antialias: true });
      this.r.outputEncoding = THREE.sRGBEncoding;
      this.r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      this.cena = new THREE.Scene();
      this.cena.add(new THREE.AmbientLight(0xffffff, 0.62));
      const luz = new THREE.DirectionalLight(0xffffff, 0.38);
      luz.position.set(0.25, 0.6, 1);
      this.cena.add(luz);
      this.cam = new THREE.PerspectiveCamera(24, 1, 1, 20000);
      this.geo = new THREE.PlaneGeometry(1, 1, SEG, SEG);
      this.matF = new THREE.MeshLambertMaterial({ side: THREE.FrontSide });
      this.matV = new THREE.MeshLambertMaterial({ side: THREE.BackSide });
      this.cena.add(new THREE.Mesh(this.geo, this.matF));
      this.cena.add(new THREE.Mesh(this.geo, this.matV));
      this.matS = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
      this.sombra = new THREE.Mesh(this.geo, this.matS);
      this.sombra.renderOrder = -1;
      this.cena.add(this.sombra);
      this.cache = new Map();
      this.visivel(false);
    }

    medir(S, zmax = 1) {
      this.W = S; this.H = S;

      const CW = Math.round(S * 2.2), CH = Math.round(S * 3.0);
      Object.assign(this.cv.style, { width: CW + 'px', height: CH + 'px', left: (S - CW) / 2 + 'px', top: (S - CH / 2) + 'px' });
      // resolucao: nitida, mas sem passar do limite da placa de video (senao a folha sai preta)
      const lim = Math.min(this.r.capabilities.maxTextureSize || 4096, 4096);
      const pr = Math.max(1, Math.min(2, devicePixelRatio || 1, lim / CW, lim / CH));
      this.r.setPixelRatio(pr);
      this.r.setSize(CW, CH, false);
      this.cam.aspect = CW / CH;
      this.D = (CH / 2) / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
      this.cam.position.set(0, 0, this.D);
      this.cam.lookAt(0, 0, 0);
      this.cam.near = this.D * 0.2; this.cam.far = this.D * 3;
      this.cam.updateProjectionMatrix();
      const uv = this.geo.attributes.uv.array;
      this.base = new Float32Array(this.geo.attributes.position.array.length);
      for (let i = 0; i < uv.length / 2; i++) { this.base[3 * i] = uv[2 * i] * S - S / 2; this.base[3 * i + 1] = (1 - uv[2 * i + 1]) * S; }
    }

    _tex(img, verso) {
      const k = img.src + (verso ? '#v' : '');
      let t = this.cache.get(k);
      if (!t) {
        // o <img> do DOM tem width = tamanho na tela; a textura precisa do tamanho real
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth || 800; cv.height = img.naturalHeight || 800;
        if (img.complete && img.naturalWidth) cv.getContext('2d').drawImage(img, 0, 0);
        else img.addEventListener('load', () => { cv.getContext('2d').drawImage(img, 0, 0); t.needsUpdate = true; }, { once: true });
        t = new THREE.Texture(cv);
        t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        if (verso) { t.repeat.set(1, -1); t.offset.set(0, 1); }
        t.needsUpdate = true;
        this.cache.set(k, t);
        if (this.cache.size > 12) { const [k0, t0] = this.cache.entries().next().value; t0.dispose(); this.cache.delete(k0); }
      }
      return t;
    }

    folha(imgFrente, imgVerso) {
      this.matF.map = this._tex(imgFrente, false); this.matF.needsUpdate = true;
      this.matV.map = this._tex(imgVerso, true); this.matV.needsUpdate = true;
    }

    visivel(v) { this.cv.style.visibility = v ? 'visible' : 'hidden'; }

    // Folha = giro rigido em volta da dobradica (phi) + a ponta pega descolando num cilindro (peel),
    // na direcao em que o mouse puxa. A borda de cima nunca descola.
    // G = ponto pego (x do centro, y para baixo da dobradica); P = ponteiro. Devolve t (0..1).
    // a folha inteira curva ao longo do comprimento: angulo cresce da emenda (a0) ate a ponta (a0 + 2b).
    // A mesma curva em todas as colunas: o papel nao estica.
    _arco(phi) {
      let b = 0.55 * Math.sin(phi);
      b = Math.min(b, phi, Math.PI - phi);           // nada entra na parede
      return { a0: phi - b, k: 2 * b / this.H };
    }
    _noArco(c, v) {   // ponto a distancia v da emenda -> [para baixo, para a camera, angulo ali]
      const a1 = c.a0 + c.k * v;
      if (Math.abs(c.k) < 1e-7) return [v * Math.cos(c.a0), v * Math.sin(c.a0), a1];
      return [(Math.sin(a1) - Math.sin(c.a0)) / c.k, (Math.cos(c.a0) - Math.cos(a1)) / c.k, a1];
    }
    _phi(G, P) {   // giro em que o ponto pego fica na altura do ponteiro (com a curva e a perspectiva)
      const D = this.D, v = G.y;
      const proj = (f) => { const [y, z] = this._noArco(this._arco(f), v); return y * D / (D - z); };
      let lo = 0, hi = Math.PI;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (proj(m) > P.y) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    desenhar(G, P, phiFixo) {
      const a = this.geo.attributes.position.array, b = this.base, W = this.W, W2 = W / 2, H = this.H;
      const phi = phiFixo ?? this._phi(G, P), t = phi / Math.PI, sp = Math.sin(phi);
      // peel: a ponta pega anda (no plano da folha) para cima e para o lado do mouse
      const lado = Math.max(-1, Math.min(1, (P.x - G.x) / W2));
      let dx = lado * 0.45, dy = -1; const L = Math.hypot(dx, dy); dx /= L; dy /= L;
      const sp15 = Math.pow(sp, 1.5);   // a ponta desentorta antes de a folha deitar
      const r = Math.max(0.5, W * 0.24 * sp15);
      const PR = Math.PI * r;
      let peel = W * 0.22 * sp15;
      // acha a linha onde a curva comeca; se ela chegar na dobradica, o peel encolhe
      const linha = (pe) => {
        if (pe < 0.5) return null;
        const nx = -dx, ny = -dy;   // normal aponta para o lado pego
        const g = (s) => s - (s < PR ? r * Math.sin(s / r) : -(s - PR));
        let lo = 0, hi = pe + PR;
        for (let k = 0; k < 28; k++) { const m = (lo + hi) / 2; if (g(m) < pe) lo = m; else hi = m; }
        const sG = (lo + hi) / 2;
        // a dobra nasce na borda de baixo, na altura (x) em que a folha foi pega
        return { nx, ny, Fx: G.x - nx * sG, Fy: H - ny * sG };
      };
      // limitador: so a emenda de cima fica dura; os cantos de cima nunca saem do lugar, o resto dobra
      const YL = this.H * 0.1;
      const invade = (l) => l ? Math.max((-W2 - l.Fx) * l.nx + (YL - l.Fy) * l.ny, (W2 - l.Fx) * l.nx + (YL - l.Fy) * l.ny) : -1;
      let l = linha(peel);
      if (invade(l) > 0) {
        let lo = 0, hi = peel;
        for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (invade(linha(m)) > 0) hi = m; else lo = m; }
        peel = lo; l = linha(peel);
      }
      const arco = this._arco(phi);
      for (let i = 0; i < a.length; i += 3) {
        const px = b[i], py = b[i + 1];
        let qx = px, qy = py, z = 0;
        if (l) {
          const s = (px - l.Fx) * l.nx + (py - l.Fy) * l.ny;
          if (s > 0) {
            let o;
            if (s < PR) { const th = s / r; o = r * Math.sin(th); z = r * (1 - Math.cos(th)); }
            else { o = -(s - PR); z = 2 * r; }
            qx = px - l.nx * s + l.nx * o; qy = py - l.ny * s + l.ny * o;
          }
        }
        // leva o ponto para a folha curvada em volta da emenda; o descolar da ponta vai pela normal
        const [yb, zb, al] = this._noArco(arco, qy);
        const yy = yb - z * Math.sin(al), zz = zb + z * Math.cos(al);
        a[i] = qx; a[i + 1] = -yy; a[i + 2] = zz;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.computeVertexNormals();
      this.sombra.position.set(this.W * 0.015, -this.W * 0.03, -2);
      this.sombra.scale.set(1, 1, 0);
      this.matS.opacity = 0.18 * sp;
      this.r.render(this.cena, this.cam);
      this.phi = phi;
      return t;
    }
  }
  window.Curl = Curl;
})();
