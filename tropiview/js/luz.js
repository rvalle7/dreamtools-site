// Sombras sobre a mesa: uma arvore (tronco e galhos grossos, tufos de folhas) e uma veneziana,
// balancando com o vento — brisa constante e rajadas aleatorias. Desenhado num canvas pequeno
// (1/4 da tela) e ampliado com desfoque: leve para o computador e com a borda macia de sombra.
(function () {
  const cv = document.getElementById('sombra');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  // o tamanho e o desfoque tambem vao aqui, para funcionar mesmo se o navegador ainda tiver o CSS antigo
  Object.assign(cv.style, { position: 'absolute', left: '-12%', top: '-12%', width: '124%', height: '124%',
    opacity: '.3', mixBlendMode: 'multiply', filter: 'blur(6px)' });
  const ESC = 0.25;
  let W = 0, H = 0, B = 0;   // B: medida de referencia das plantas (largura no PC, ~altura no celular em pe)

  // gerador aleatorio com semente (a arvore e sempre a mesma)
  let semente = 73;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return (semente - 1) / 2147483646; };

  // ---------- a arvore ----------
  function galho(prof, comp, larg, ang) {
    const g = { comp, larg, ang, fase: rnd() * 6.28, filhos: [], folhas: [] };
    if (prof < 5) {
      const n = prof < 2 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const abre = (i - (n - 1) / 2) * (0.55 + rnd() * 0.25) + (rnd() - 0.5) * 0.25;
        g.filhos.push({ em: 0.55 + rnd() * 0.4, g: galho(prof + 1, comp * (0.62 + rnd() * 0.18), larg * 0.62, abre) });
      }
    }
    if (prof >= 3) {   // tufos de folhas
      const n = 5 + Math.floor(rnd() * 6);
      for (let i = 0; i < n; i++)
        g.folhas.push({ t: 0.35 + rnd() * 0.75, dx: (rnd() - 0.5) * comp * 0.9, rx: comp * (0.16 + rnd() * 0.14),
                        ry: comp * (0.08 + rnd() * 0.07), r: rnd() * 3.14, fase: rnd() * 6.28 });
    }
    return g;
  }
  // duas arvores entrando pelas bordas (fracoes da tela)
  const arvores = [
    { x: -0.04, y: 1.04, ang: -0.9, g: galho(0, 0.40, 0.036, 0) },
    { x: 1.06, y: -0.04, ang: 2.4, g: galho(0, 0.36, 0.032, 0) },
  ];

  // ---------- o vento ----------
  let rajada = 0, alvoRaj = 0, proxRaj = 3000;
  function vento(t) {
    if (t > proxRaj) { alvoRaj = 0.5 + Math.random() * 0.7; proxRaj = t + 5000 + Math.random() * 9000; setTimeout(() => alvoRaj = 0, 1400 + Math.random() * 1600); }
    rajada += (alvoRaj - rajada) * (alvoRaj > rajada ? 0.03 : 0.012);
    return 0.35 + 0.25 * Math.sin(t * 0.00031) + rajada;   // brisa + rajada
  }

  function desenhaGalho(g, x, y, ang, prof, t, v) {
    // pontas balancam mais que o tronco
    const balanco = (0.012 + prof * 0.016) * (Math.sin(t * (0.0011 + prof * 0.0004) + g.fase) * 0.6 + v * 0.9);
    const a = ang + g.ang + balanco;
    const L = g.comp * B, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    ctx.lineWidth = Math.max(1, g.larg * B);
    ctx.beginPath(); ctx.moveTo(x, y);
    const cx = (x + ex) / 2 + Math.cos(a + 1.57) * L * 0.06, cy = (y + ey) / 2 + Math.sin(a + 1.57) * L * 0.06;
    ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    for (const f of g.folhas) {
      const fx = x + (ex - x) * f.t + Math.cos(a + 1.57) * f.dx, fy = y + (ey - y) * f.t + Math.sin(a + 1.57) * f.dx;
      const tremor = Math.sin(t * 0.004 + f.fase) * 0.15 * v;
      ctx.beginPath(); ctx.ellipse(fx, fy, f.rx * B, f.ry * B, f.r + a + tremor, 0, 6.283); ctx.fill();
    }
    for (const c of g.filhos)
      desenhaGalho(c.g, x + (ex - x) * c.em, y + (ey - y) * c.em, a, prof + 1, t, v);
  }

  function desenhaArvore(t, v) {
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineCap = 'round';
    for (const A of arvores) desenhaGalho(A.g, A.x * W, A.y * H, A.ang, 0, t, v);
  }

  function desenhaVeneziana(t, v) {
    ctx.save();
    ctx.translate(W * 0.74, H * 0.26);   // a cruz da janela fica para cima e para a direita, fora do meio
    ctx.rotate(-0.24 + Math.sin(t * 0.0007) * 0.004 * v);
    ctx.transform(1, 0, -0.21, 1, 0, 0);
    ctx.fillStyle = '#000';
    // ripas proporcionais a tela (no celular ficam mais finas)
    const k = Math.min(1, Math.min(innerWidth, innerHeight) / 900);
    const passo = 31 * 1.24 * ESC * Math.min(1, 2 * k) * 1.15 * 0.85, ripa = passo * 0.59;   // no celular o dobro do que era (no PC nao muda)
    for (let i = -60; i < 60; i++) {
      // cada ripa chacoalha um pouquinho nas rajadas
      const dy = rajada * passo * 0.22 * Math.sin(t * 0.011 + i * 1.7);
      ctx.fillRect(-W * 1.5, i * passo + dy, W * 3, ripa);
    }
    ctx.fillRect(-passo * 0.7, -H * 1.5, passo * 1.35, H * 3);    // a cruz da janela
    ctx.fillRect(-W * 1.5, -passo * 0.7, W * 3, passo * 1.35);
    ctx.restore();
  }

  function medir() {
    W = cv.width = Math.max(200, Math.round(innerWidth * 1.24 * ESC));
    H = cv.height = Math.max(150, Math.round(innerHeight * 1.24 * ESC));
    B = Math.max(W, H * 0.6) * 0.85;   // plantas 15% menores
  }
  medir();
  addEventListener('resize', medir);

  // ---------- a palmeira ----------
  // folhas compridas saindo de uma copa fora da tela, com foliolos largos que tremulam
  const palmas = [];
  for (const copa of [{ x: 1.04, y: -0.08 }, { x: -0.06, y: 0.9 }]) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const base = copa.x > 0.5 ? 1.35 + i * 0.32 : -0.95 + i * 0.3;
      const fol = [];
      for (let j = 0; j < 26; j++) fol.push({ t: 0.08 + j * 0.035, l: 0.9 + rnd() * 0.25, fase: rnd() * 6.28 });
      palmas.push({ copa, ang: base + (rnd() - 0.5) * 0.15, comp: 0.5 + rnd() * 0.16, curva: 0.55 + rnd() * 0.3, fase: rnd() * 6.28, fol });
    }
  }
  function desenhaPalmeira(t, v) {
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000'; ctx.lineCap = 'round';
    for (const p of palmas) {
      const x0 = p.copa.x * W, y0 = p.copa.y * H, L = p.comp * B;
      const balanco = (Math.sin(t * 0.0009 + p.fase) * 0.5 + v) * 0.05;
      // a nervura central: curva que vai caindo para a ponta
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, a = p.ang + balanco * (0.4 + u) + p.curva * u * u * (p.copa.x > 0.5 ? -1 : 1) * 0.6;
        const ant = pts[k - 1] || [x0, y0];
        pts.push(k === 0 ? [x0, y0, a] : [ant[0] + Math.cos(a) * L / 24, ant[1] + Math.sin(a) * L / 24, a]);
      }
      ctx.lineWidth = Math.max(1, B * 0.006);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke();
      // foliolos dos dois lados, largos, tremulando com o vento
      for (const f of p.fol) {
        const k = Math.min(23, Math.floor(f.t * 24)), q = pts[k];
        const comp = L * 0.26 * f.l * Math.sin(Math.PI * Math.min(1, f.t * 1.05)) + L * 0.04;
        for (const lado of [-1, 1]) {
          const a = q[2] + lado * (0.85 + Math.sin(t * 0.005 + f.fase + lado) * 0.12 * v);
          const ex = q[0] + Math.cos(a) * comp, ey = q[1] + Math.sin(a) * comp;
          const lx = Math.cos(a + 1.57) * comp * 0.09, ly = Math.sin(a + 1.57) * comp * 0.09;
          ctx.beginPath(); ctx.moveTo(q[0], q[1]);
          ctx.quadraticCurveTo((q[0] + ex) / 2 + lx, (q[1] + ey) / 2 + ly, ex, ey);
          ctx.quadraticCurveTo((q[0] + ex) / 2 - lx, (q[1] + ey) / 2 - ly, q[0], q[1]);
          ctx.fill();
        }
      }
    }
  }

  // ---------- revezamento: veneziana, galhos, palmeira (26 s cada, troca lenta de 7 s) ----------
  const MODOS = [desenhaVeneziana, desenhaArvore, desenhaPalmeira];
  const inicial = { '#arvore': 1, '#palmeira': 2 }[location.hash] ?? 0;
  let atual = inicial, anterior = inicial, inicioTroca = -1e9;
  setInterval(() => { anterior = atual; atual = (atual + 1) % MODOS.length; inicioTroca = performance.now(); }, 26000);

  function quadro(t) {
    const v = vento(t);
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(1, (t - inicioTroca) / 7000), e = (1 - Math.cos(Math.PI * u)) / 2;
    if (u < 1 && 1 - e > 0.01) { ctx.globalAlpha = 1 - e; MODOS[anterior](t, v); }
    ctx.globalAlpha = u < 1 ? e : 1; MODOS[atual](t, v);
    ctx.globalAlpha = 1;
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
})();
