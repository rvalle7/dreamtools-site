(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const guardar = (k, v) => { try { localStorage.setItem('tv.' + k, v); } catch (e) {} };
  const ler = (k, d) => { try { return localStorage.getItem('tv.' + k) || d; } catch (e) { return d; } };
  const B = document.body;

  // os calendarios que estao na mesa (amanha entram mais: e so acrescentar aqui e exportar as paginas)
  const CATALOGO = [
    { id: 'rio', nome: 'Rio Calendar 2027', cor: '#FF723F' },
    { id: 'dogs', nome: 'Dog’s Calendar 2027', cor: '#1FB07C' },
  ];
  // uma cor de fundo por tela; o fundo do calendario aberto e a cor dele
  const COR = { mesa: '#FF723F', sobre: '#165E57', fotografos: '#1E9F77', contato: '#13564F' };

  const est = { lang: ler('lang', (navigator.language || 'en').startsWith('pt') ? 'pt' : 'en'), cal: null, tam: '30', tela: 'mesa' };

  // ---------- idioma ----------
  const T = (k) => (TV_I18N[est.lang] || TV_I18N.en)[k] ?? TV_I18N.en[k] ?? k;
  function traduzir() {
    document.documentElement.lang = est.lang;
    $$('[data-t]').forEach(n => n.textContent = T(n.dataset.t));
    $$('.lang').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === est.lang));
    if (livro.N) rotulo(Math.round(livro.f), livro.N);
  }

  // ---------- livro ----------
  const livro = new Livro($('#livro'), { onMuda: (i, n) => rotulo(i, n), onCarga: (p) => carga(p) });
  // linha fininha embaixo do calendario: enche conforme as paginas baixam e some quando completa
  function carga(p) {
    const l = $('#carga');
    l.style.setProperty('--p', p.toFixed(3));
    l.classList.toggle('cheia', p >= 1);
  }
  window.__tvLivro = livro;   // para depurar no console
  function rotulo(i, n) {
    const m = T('months');
    let txt;
    if (i === 0) txt = T('cover');
    else if (i === n) txt = T('back');
    else if (i === n - 1) txt = T('summary');
    else { const j = i - 1; txt = `${m[j % 12]} ${2027 + Math.floor(j / 12)}`; }
    $('#rotulo').textContent = txt;
    $('#ant').disabled = i === 0; $('#prox').disabled = i === n;
  }
  function carregarCal() {
    const chave = `${est.cal}-${est.tam}`;
    // baixa so o tamanho que a tela precisa: lado da pagina na tela x densidade de pixels
    const fio = Math.max(10, innerHeight * 0.022);
    const lado = Math.min((innerHeight - 2 * fio) / 2, innerWidth * 0.92) * (devicePixelRatio || 1);
    livro.carregar(chave, TV_SEQ[chave], lado <= 820 ? '-800' : lado <= 1250 ? '-1200' : '');
    $$('.tam').forEach(b => b.setAttribute('aria-pressed', b.dataset.tam === est.tam));
  }
  const capaDe = (id) => `img/${id}-30/p${String(TV_SEQ[id + '-30'].capa).padStart(2, '0')}-sq-800.webp`;

  // ---------- a mesa ----------
  const capas = $('.capas');
  capas.innerHTML = CATALOGO.map((c, i) =>
    `<button class="capa" data-cal="${c.id}" style="--i:${i}" aria-label="${c.nome}"><img alt="" src="${capaDe(c.id)}" fetchpriority="high" draggable="false"></button>`).join('');
  function medirMesa() {
    const n = CATALOGO.length;
    const empe = innerHeight > innerWidth * 1.15;   // celular em pe: um embaixo do outro
    capas.classList.toggle('coluna', empe);
    let lado;
    if (empe) {
      const gap = innerHeight * 0.04, porCol = Math.min(n, 3);
      lado = Math.min(innerWidth * 0.66, (innerHeight * 0.74 - (porCol - 1) * gap) / porCol);
    } else {
      const porLinha = Math.min(n, 4);
      lado = Math.min((innerWidth * 0.74 - (porLinha - 1) * innerWidth * 0.05) / porLinha, innerHeight * 0.5);
    }
    capas.style.setProperty('--c', Math.floor(lado) + 'px');
  }
  // as capas precisam estar carregadas antes de cair na mesa (no celular a internet e mais lenta)
  const capasProntas = Promise.race([
    Promise.all($$('.capa img').map(im => im.decode ? im.decode().catch(() => {}) : Promise.resolve())),
    new Promise(r => setTimeout(r, 8000)),
  ]);
  // os calendarios caem de tras da camera, um depois do outro, e se assentam na mesa
  function entrarMesa() {
    $$('.capa').forEach(c => { c.style.transition = 'none'; c.style.transform = ''; c.style.opacity = ''; });
    capas.classList.remove('assentou');
    capas.getBoundingClientRect();
    $$('.capa').forEach(c => c.style.transition = '');
    const primeira = !capas.dataset.ja; capas.dataset.ja = '1';
    capas.classList.toggle('estreia', primeira);   // o brilho so na entrada do carregamento
    requestAnimationFrame(() => capas.classList.add('assentou'));
  }

  // ---------- trocar de tela: so pelo menu ----------
  // a cor do fundo passa pelo circulo de cores (HSL), sem ficar marrom no meio do caminho
  const hsl = (h) => { let [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let hh = 0, s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; }
    return [(hh * 60 + 360) % 360, s * 100, l * 100]; };
  let corAtual = null, rafCor;
  // no iPhone as barras de cima e de baixo do Safari seguem o theme-color e o fundo do <html>
  const tema = document.querySelector('meta[name="theme-color"]');
  function aplicaCor(c) { B.style.backgroundColor = c; document.documentElement.style.backgroundColor = c; if (tema) tema.content = c; }
  function pintar(cor) {
    pararDeriva();
    const alvo = hsl(cor);
    if (!corAtual) { corAtual = alvo; aplicaCor(cor); return; }
    const de = [...corAtual]; let dh = alvo[0] - de[0]; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    cancelAnimationFrame(rafCor);
    const t0 = performance.now();
    const passo = (t) => {
      const u = Math.min(1, (t - t0) / 1100), e = (1 - Math.cos(Math.PI * u)) / 2;
      corAtual = [(de[0] + dh * e + 360) % 360, de[1] + (alvo[1] - de[1]) * e, de[2] + (alvo[2] - de[2]) * e];
      aplicaCor(`hsl(${corAtual[0].toFixed(1)} ${corAtual[1].toFixed(1)}% ${corAtual[2].toFixed(1)}%)`);
      if (u < 1) rafCor = requestAnimationFrame(passo);
      else if (cor === COR.mesa && est.tela === 'mesa' && !B.classList.contains('intro')) iniciarDeriva();
    };
    rafCor = requestAnimationFrame(passo);
  }

  // so na mesa principal: o fundo passeia bem devagar pelas cores do por do sol da abertura e volta
  // (laranja -> dourado -> amarelo -> rosado -> roxo -> azul do ceu -> ... -> laranja), ~2 min a volta inteira
  let rafDeriva = 0;
  function pararDeriva() { cancelAnimationFrame(rafDeriva); rafDeriva = 0; }
  function iniciarDeriva() {
    pararDeriva();
    const paradas = [COR.mesa, '#EDA431', '#F4C64E', '#D0688F', '#7E6CC6', '#5AA7DE'].map(hsl);
    const T = 60000, t0 = performance.now();   // 1 min a volta inteira
    const passo = (t) => {
      if (est.tela !== 'mesa') { rafDeriva = 0; return; }
      const e = (1 - Math.cos(2 * Math.PI * ((t - t0) / T))) / 2;       // vai e volta, suave nas pontas
      const x = e * (paradas.length - 1), i = Math.min(paradas.length - 2, Math.floor(x)), f = x - i;
      const a = paradas[i], b = paradas[i + 1];
      let dh = b[0] - a[0]; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
      corAtual = [(a[0] + dh * f + 360) % 360, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      aplicaCor(`hsl(${corAtual[0].toFixed(1)} ${corAtual[1].toFixed(1)}% ${corAtual[2].toFixed(1)}%)`);
      rafDeriva = requestAnimationFrame(passo);
    };
    rafDeriva = requestAnimationFrame(passo);
  }

  function ir(tela) {
    if (tela === est.tela) { if (tela === 'mesa') return; }
    const de = est.tela;
    if (de === 'cal' && tela === 'mesa') { voltarDoCal(); return; }
    if (de === 'cal') { livro.ir(0); if (zoom) { zoom.classList.remove('escolhida'); zoom = null; } }
    est.tela = tela;
    B.dataset.estado = tela;
    pintar(COR[tela] || COR.mesa);
    $$('.menu a').forEach(a => a.classList.toggle('atual', a.dataset.ir === (tela === 'cal' ? 'mesa' : tela)));
    if (tela === 'mesa') entrarMesa();
  }
  $$('[data-ir]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); ir(a.dataset.ir); }));

  // clicou num calendario: a camera fecha nele e o outro escorrega para fora
  let zoom = null;
  $$('.capa').forEach(c => c.addEventListener('click', () => {
    if (est.tela !== 'mesa' || zoom) return;
    est.cal = c.dataset.cal; est.tam = '30';
    carregarCal();
    const r0 = c.getBoundingClientRect(), S = livro.S * livro.zoomFechado;
    const dx = innerWidth / 2 - (r0.left + r0.width / 2), dy = innerHeight / 2 - (r0.top + r0.height / 2);   // centro com centro
    zoom = c;
    c.classList.add('escolhida');
    c.style.transform = `translate(${dx}px, ${dy}px) scale(${S / r0.width})`;
    $$('.capa').forEach(o => {
      if (o === c) return;
      const lado = o.getBoundingClientRect().left < r0.left ? -1 : 1;
      o.style.transform = `translateX(${lado * 70}vw) rotate(${lado * 4}deg)`;
      o.style.opacity = '0';
    });
    pintar(CATALOGO.find(x => x.id === est.cal).cor);
    // quando a capa chega, troca pelo calendario de verdade sem piscar:
    // espera a imagem da capa estar pronta e so tira a mesa dois quadros depois
    livro.preparar();
    const capaLivro = livro.folhas[0].frente;
    const pronta = capaLivro.decode ? capaLivro.decode().catch(() => {}) : Promise.resolve();
    setTimeout(() => pronta.then(() => {
      B.classList.add('cobre');
      est.tela = 'cal'; B.dataset.estado = 'cal';
      setTimeout(() => B.classList.remove('cobre'), 120);
      $('#livro').focus({ preventScroll: true });
    }), 1150);
  }));
  // no zoom, clicar no fundo volta para a lista dos calendarios
  $('#visor').addEventListener('click', (e) => { if (e.target === e.currentTarget && est.tela === 'cal') ir('mesa'); });
  function voltarDoCal() {
    const c = zoom;
    livro.ir(0);
    B.classList.add('sem-fade'); setTimeout(() => B.classList.remove('sem-fade'), 120);
    est.tela = 'mesa'; B.dataset.estado = 'mesa';
    pintar(COR.mesa);
    $$('.menu a').forEach(a => a.classList.toggle('atual', a.dataset.ir === 'mesa'));
    if (!c) { entrarMesa(); return; }
    requestAnimationFrame(() => {
      c.classList.remove('escolhida');
      $$('.capa').forEach(o => { o.style.transform = ''; o.style.opacity = ''; });
      zoom = null;
    });
  }

  // ---------- abertura: o fundo entardece enquanto a marca se constroi ----------
  // azul do ceu -> roxo -> (tons quentes) -> amarelo -> dourado -> o laranja da mesa
  function porDoSol() {
    const paradas = ['#5AA7DE', '#7E6CC6', '#D0688F', '#F4C64E', '#EDA431', COR.mesa].map(hsl);
    const dur = 5600, t0 = performance.now();
    corAtual = paradas[0]; aplicaCor(paradas[0] && `hsl(${paradas[0][0]} ${paradas[0][1]}% ${paradas[0][2]}%)`);
    const passo = (t) => {
      const u = Math.min(1, (t - t0) / dur), e = (1 - Math.cos(Math.PI * u)) / 2;
      const x = e * (paradas.length - 1), i = Math.min(paradas.length - 2, Math.floor(x)), f = x - i;
      const a = paradas[i], b = paradas[i + 1];
      let dh = b[0] - a[0]; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
      corAtual = [(a[0] + dh * f + 360) % 360, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      aplicaCor(`hsl(${corAtual[0].toFixed(1)} ${corAtual[1].toFixed(1)}% ${corAtual[2].toFixed(1)}%)`);
      if (u < 1 && B.classList.contains('intro')) rafCor = requestAnimationFrame(passo);
      else pintar(COR.mesa);
    };
    rafCor = requestAnimationFrame(passo);
  }

  // ---------- roda, teclado ----------
  let trava = 0;
  addEventListener('wheel', (e) => {
    if (est.tela !== 'cal' || Math.abs(e.deltaY) < 3) return;
    const t = performance.now();
    if (t - trava < 260) return; trava = t;
    e.deltaY > 0 ? livro.prox() : livro.ant();
  }, { passive: true });
  addEventListener('keydown', (e) => {
    if (est.tela !== 'cal') return;
    if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); livro.prox(); }
    else if (['ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); livro.ant(); }
    else if (e.key === 'Escape' && !document.fullscreenElement) ir('mesa');
  });

  // ---------- a interface aparece quando o mouse mexe fora do calendario ----------
  let timer;
  function mostrarUI() {
    B.classList.add('ui-on');
    clearTimeout(timer);
    timer = setTimeout(() => B.classList.remove('ui-on'), 2400);
  }
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || B.classList.contains('intro')) return;
    if (est.tela === 'cal' && e.target.closest('#livro')) { B.classList.remove('ui-on'); clearTimeout(timer); }
    else mostrarUI();
    // fotos das paginas andam um pouquinho com o mouse
    const fx = (e.clientX / innerWidth - 0.5), fy = (e.clientY / innerHeight - 0.5);
    $$('.pagina .foto img').forEach(im => im.style.transform = `translate(${(-fx * 9).toFixed(2)}%, ${(-fy * 9).toFixed(2)}%) scale(1.2)`);
  });
  // no celular o menu so aparece com um toque rapido (tap); rolar ou arrastar nao mostra
  let toque = null;
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') toque = { x: e.clientX, y: e.clientY, t: performance.now(), livro: !!e.target.closest('#livro') }; });
  addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || !toque) return;
    const tap = Math.hypot(e.clientX - toque.x, e.clientY - toque.y) < 10 && performance.now() - toque.t < 350;
    if (tap && !toque.livro) mostrarUI();
    toque = null;
  });
  addEventListener('pointercancel', () => { toque = null; });   // o navegador assumiu o gesto (rolagem)
  document.addEventListener('focusin', (e) => { if (e.target.closest('.ui')) mostrarUI(); });

  // ---------- luz sobre a mesa ----------
  // a luz segue o mouse com atraso (bem sutil); as sombras de folhagem e veneziana se alternam devagar
  const foco = $('#luz .foco');
  let lx = innerWidth * 0.6, ly = innerHeight * 0.4, mx = lx, my = ly;
  addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  (function luz() {
    lx += (mx - lx) * 0.04; ly += (my - ly) * 0.04;
    foco.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
    // sombra das capas: no maximo 8 px, para o lado oposto da luz
    capas.style.setProperty('--sx', ((innerWidth / 2 - lx) / innerWidth * 16).toFixed(1));
    capas.style.setProperty('--sy', ((innerHeight / 2 - ly) / innerHeight * 12).toFixed(1));
    requestAnimationFrame(luz);
  })();

  // ---------- controles ----------
  $$('.lang').forEach(b => b.onclick = () => { est.lang = b.dataset.lang; guardar('lang', est.lang); traduzir(); });
  // trocar 30/18 mantem a pagina que esta aberta
  $$('.tam').forEach(b => b.onclick = () => { if (est.tam === b.dataset.tam) return; const k = livro.k; est.tam = b.dataset.tam; carregarCal(); livro.ir(k); livro.preparar(); });
  $('#prox').onclick = () => livro.prox();
  $('#ant').onclick = () => livro.ant();
  const cheia = $('#cheia');
  if (!document.fullscreenEnabled) cheia.hidden = true;
  cheia.onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  addEventListener('resize', () => { medirMesa(); });
  document.addEventListener('fullscreenchange', () => setTimeout(() => { livro.medir(); medirMesa(); }, 80));

  // fotos das paginas
  $$('img[data-foto]').forEach(img => {
    const [chave, pag] = img.dataset.foto.split(':');
    img.src = `img/${chave}/p${String(TV_SEQ[chave].meses[+pag - 1]).padStart(2, '0')}-top.webp`;
  });

  // ---------- abertura: a marca se desenha, brilha, faz plim e sobe para o canto ----------
  function abertura() {
    const box = $('.logo-intro');
    box.innerHTML = TV_LOGO;
    $('.marca').innerHTML = TV_LOGO;
    const svg = box.querySelector('svg');
    const formas = [...svg.querySelectorAll('path, polygon, rect')];
    const ns = 'http://www.w3.org/2000/svg';
    const vb = svg.viewBox.baseVal;
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `<clipPath id="clipLogo"></clipPath>
      <linearGradient id="gBrilho" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <filter id="halo" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
    svg.prepend(defs);
    const clip = defs.querySelector('clipPath');
    formas.forEach((f, i) => {
      clip.appendChild(f.cloneNode());
      f.removeAttribute('class'); f.classList.add('f');
      let L = 400; try { L = Math.ceil(f.getTotalLength()); } catch (e) {}
      f.style.setProperty('--L', L);
      f.style.setProperty('--d', (i * 0.045).toFixed(3) + 's');
    });
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('clip-path', 'url(#clipLogo)');
    g.innerHTML = `<rect class="brilho" x="${-vb.width * 0.45}" y="${vb.y - 30}" width="${vb.width * 0.3}" height="${vb.height + 60}" fill="url(#gBrilho)" filter="url(#halo)"/>`;
    g.style.setProperty('--anda', vb.width * 1.6 + 'px');
    svg.appendChild(g);
    const est_ = $('.estrela');

    let acabou = false;
    const fim = () => {
      if (acabou) return; acabou = true;
      document.body.classList.remove('intro', 'desenha', 'brilha', 'plim');
      mostrarUI();
      setTimeout(() => { if (est.tela === 'mesa' && !rafDeriva) pintar(COR.mesa); }, 1200);   // comeca o passeio de cor da mesa
      capasProntas.then(() => setTimeout(entrarMesa, 250));   // os calendarios caem na mesa quando as fotos chegaram
      // as fotos das outras telas so baixam depois que a mesa esta montada
      capasProntas.then(() => setTimeout(() => $$('.foto img[data-src]').forEach(im => im.src = im.dataset.src), 3000));
    };
    $('#abertura').addEventListener('click', fim);
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('desenha')));
    setTimeout(() => {
      document.body.classList.add('brilha');
      const r = svg.getBoundingClientRect();
      est_.style.left = (r.left + r.width * 0.98) + 'px';
      est_.style.top = (r.top + r.height * 0.06) + 'px';
    }, 3500);
    setTimeout(() => document.body.classList.add('plim'), 4300);
    setTimeout(() => {   // sobe para o canto
      const r0 = box.getBoundingClientRect(), r1 = $('.marca').getBoundingClientRect();
      box.style.left = '0'; box.style.top = '0';
      box.style.transform = `translate(${r0.left}px, ${r0.top}px)`;
      box.getBoundingClientRect();
      box.classList.add('sobe');
      box.style.transform = `translate(${r1.left}px, ${r1.top}px) scale(${r1.width / r0.width})`;
    }, 5200);
    setTimeout(fim, 6500);
  }

  medirMesa();
  est.cal = CATALOGO[0].id; carregarCal(); est.cal = null;
  porDoSol();
  $$('.menu a').forEach(a => a.classList.toggle('atual', a.dataset.ir === 'mesa'));
  traduzir();
  abertura();
})();
