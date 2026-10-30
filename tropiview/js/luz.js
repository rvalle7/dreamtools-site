// Sombras sobre a mesa: uma arvore (tronco e galhos grossos, tufos de folhas) e uma veneziana,
// balancando com o vento — brisa constante e rajadas aleatorias. Desenhado num canvas pequeno
// (1/4 da tela) e ampliado com desfoque: leve para o computador e com a borda macia de sombra.
(function () {
  const cv = document.getElementById('sombra');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const ESC = 0.25;
  let W = 0, H = 0;

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
    { x: -0.08, y: 1.08, ang: -0.95, g: galho(0, 0.30, 0.030, 0) },
    { x: 1.10, y: -0.06, ang: 2.35, g: galho(0, 0.26, 0.026, 0) },
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
    const L = g.comp * W, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L;
    ctx.lineWidth = Math.max(1, g.larg * W);
    ctx.beginPath(); ctx.moveTo(x, y);
    const cx = (x + ex) / 2 + Math.cos(a + 1.57) * L * 0.06, cy = (y + ey) / 2 + Math.sin(a + 1.57) * L * 0.06;
    ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
    for (const f of g.folhas) {
      const fx = x + (ex - x) * f.t + Math.cos(a + 1.57) * f.dx, fy = y + (ey - y) * f.t + Math.sin(a + 1.57) * f.dx;
      const tremor = Math.sin(t * 0.004 + f.fase) * 0.15 * v;
      ctx.beginPath(); ctx.ellipse(fx, fy, f.rx * W, f.ry * W, f.r + a + tremor, 0, 6.283); ctx.fill();
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
    ctx.translate(W * 0.5, H * 0.5);
    ctx.rotate(-0.24 + Math.sin(t * 0.0007) * 0.004 * v);
    ctx.transform(1, 0, -0.21, 1, 0, 0);
    ctx.fillStyle = '#000';
    const passo = 31 * ESC * (W / (innerWidth * ESC)), ripa = passo * 0.59;
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
  }
  medir();
  addEventListener('resize', medir);

  // alterna arvore e veneziana a cada 26 s, numa troca lenta de 7 s
  let modo = location.hash === '#arvore' ? 0 : 1, troca = 0, inicioTroca = -1e9;
  setInterval(() => { troca = modo; modo = 1 - modo; inicioTroca = performance.now(); }, 26000);

  function quadro(t) {
    const v = vento(t);
    ctx.clearRect(0, 0, W, H);
    const u = Math.min(1, (t - inicioTroca) / 7000), e = (1 - Math.cos(Math.PI * u)) / 2;
    const pesos = modo === 0 ? [e, 1 - e] : [1 - e, e];   // [arvore, veneziana]
    if (u >= 1) { pesos[0] = modo === 0 ? 1 : 0; pesos[1] = 1 - pesos[0]; }
    if (pesos[0] > 0.01) { ctx.globalAlpha = pesos[0]; desenhaArvore(t, v); }
    if (pesos[1] > 0.01) { ctx.globalAlpha = pesos[1]; desenhaVeneziana(t, v); }
    ctx.globalAlpha = 1;
    requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
})();
