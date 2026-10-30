// Calendario de parede que vira para cima, dobradica no meio.
// As paginas paradas sao imagens no DOM; a folha que esta virando e desenhada pela Curl (WebGL).
// Folha i: frente = metade de baixo; verso = foto do mes seguinte (aparece em cima depois de virada).
(function () {
  const DUR = 1250;   // ms de uma virada automatica

  class Livro {
    constructor(el, opts) {
      this.el = el;
      this.onMuda = opts.onMuda || (() => {});
      this.base = opts.base || 'img';
      this.k = 0;              // quantas folhas ja viraram
      this.vira = null;        // folha em movimento: {i, G, P, dir}
      this.fila = 0;           // viradas pedidas pela roda/teclado
      this.palco = document.createElement('div');
      this.palco.className = 'paginas';
      el.appendChild(this.palco);
      this.curl = new Curl(el);
      this._eventos();
      addEventListener('resize', () => this.medir());
    }

    carregar(chave, seq, hd) {
      const pg = (n, k) => `${this.base}/${chave}/p${String(n).padStart(2, '0')}-${k}${hd ? '' : '-800'}.webp`;
      const m = seq.meses;
      const folhas = [{ frente: pg(seq.capa, 'sq'), verso: pg(m[0], 'top') }];
      for (let j = 0; j < m.length; j++)
        folhas.push({ frente: pg(m[j], 'bot'), verso: j + 1 < m.length ? pg(m[j + 1], 'top') : pg(seq.contra, 'sq') });
      this.N = folhas.length;
      this.palco.innerHTML = '';
      this.folhas = folhas.map((d) => {
        const s = document.createElement('div');
        s.className = 'folha-l';
        // as imagens so baixam quando a folha chega perto (data-src -> src): no celular nao trava a abertura
        s.innerHTML = `<img class="frente" alt="" draggable="false" decoding="async" data-src="${d.frente}">` +
                      `<img class="verso" alt="" draggable="false" decoding="async" data-src="${d.verso}">`;
        this.palco.appendChild(s);
        return { el: s, frente: s.children[0], verso: s.children[1] };
      });
      this.k = 0; this.vira = null; this.fila = 0; this._fimId = 0; this._ult = undefined;
      this.medir();
    }

    medir() {
      const fio = Math.max(10, innerHeight * 0.022);
      const sH = (innerHeight - 2 * fio) / 2;
      const sW = innerWidth - 2 * Math.max(16, innerWidth * 0.04);
      this.S = Math.floor(Math.min(sH, sW));
      this.el.style.setProperty('--s', this.S + 'px');
      this.zoomFechado = Math.max(1, Math.min(1.6, innerHeight * 0.84 / this.S, innerWidth * 0.84 / this.S));
      this.curl.medir(this.S, this.zoomFechado);
      this.render();
    }

    get f() { return this.vira ? this.vira.i + this.vira.t : this.k; }

    render() {
      const N = this.N, S = this.S, f = this.f;
      // fechado o calendario aparece maior; conforme abre, a camera afasta ate o 30x60 caber
      const Z = this.zoomFechado, ease = (u) => (1 - Math.cos(Math.PI * u)) / 2;
      let desl = 0, z = 1;
      if (f <= 1) { z = 1 + (Z - 1) * ease(1 - f); desl = -S / 2 * (1 - f) * z; }
      else if (f >= N - 1) { const u = f - (N - 1); z = 1 + (Z - 1) * ease(u); desl = S / 2 * u * z; }
      this.z = z;
      this.el.style.transform = `translate(-50%, -50%) translateY(${desl}px) scale(${z})`;
      const iv = this.vira ? this.vira.i : -1;
      // em cima: verso da ultima folha virada; embaixo: frente da proxima
      const topo = this.vira ? iv - 1 : this.k - 1;
      const baixo = this.vira ? iv + 1 : this.k;
      this.folhas.forEach((s, i) => {
        s.verso.classList.toggle('on', i === topo);
        s.frente.classList.toggle('on', i === baixo);
      });
      const idx = Math.round(f);
      if (idx !== this._ult) { this._ult = idx; this.onMuda(idx, N); this._baixar(idx); }
    }

    // baixa (e decodifica) so as folhas em volta da pagina aberta, para a virada nao piscar
    _baixar(idx) {
      if (!this.ativo) return;   // so depois que um calendario foi escolhido
      for (let i = Math.max(0, idx - 2); i <= Math.min(this.N - 1, idx + 3); i++)
        for (const im of [this.folhas[i].frente, this.folhas[i].verso])
          if (!im.src && im.dataset.src) { im.src = im.dataset.src; im.decode && im.decode().catch(() => {}); }
    }
    // escolheu o calendario: baixa ja as folhas em volta e depois todas as outras, uma por vez, em segundo plano.
    // O que ja baixou fica guardado (o navegador mantem as imagens), entao voltar paginas nao recarrega.
    preparar() {
      this.ativo = true;
      this._baixar(Math.round(this.f));
      const lote = this._lote = (this._lote || 0) + 1;
      const fila = this.folhas.flatMap(f => [f.frente, f.verso]);
      const proxima = () => {
        if (lote !== this._lote) return;            // trocou de calendario: para esta fila
        const im = fila.find(i => !i.src && i.dataset.src);
        if (!im) return;
        im.src = im.dataset.src;
        const segue = () => setTimeout(proxima, 30);
        (im.decode ? im.decode() : Promise.resolve()).then(segue, segue);
      };
      setTimeout(proxima, 600);
    }

    // --- uma folha em movimento: G = ponto pego (coords da folha), P = ponteiro ---
    _comecar(i, G, P) {
      const s = this.folhas[i];
      this.curl.folha(s.frente, s.verso);
      this.vira = { i, G, P, t: 0, phi: undefined };
      this._desenhar();
      this.curl.visivel(true);
    }
    _desenhar() {
      const v = this.vira;
      v.t = this.curl.desenhar(v.G, v.P, v.phi);
      this.render();
    }
    _terminar(virou) {
      const v = this.vira;
      this.vira = null;
      this.k = virou ? v.i + 1 : v.i;
      this.render();
      // a imagem parada aparece primeiro; a folha 3D so some dois quadros depois (sem piscar)
      const fim = ++this._fimId;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (fim === this._fimId && !this.vira) this.curl.visivel(false); }));
      if (this.fila) { const d = Math.sign(this.fila); this.fila -= d; d > 0 ? this.prox() : this.ant(); }
    }
    // leva o ponteiro ate o alvo, suave na saida e na chegada
    // anima o giro da folha ate o alvo (0 = embaixo, PI = virada). solta = saiu da mao: so desacelera.
    _animar(alvo, dur, fim, solta) {
      const v = this.vira, f0 = this.curl.phi ?? (v.t * Math.PI), x0 = v.P.x, t0 = performance.now();
      cancelAnimationFrame(this._raf);
      const passo = (agora) => {
        const u = Math.min(1, (agora - t0) / dur);
        const e = solta ? 1 - Math.pow(1 - u, 3) : (1 - Math.cos(Math.PI * u)) / 2;
        v.phi = f0 + (alvo - f0) * e;
        v.P = { x: x0 + (v.G.x - x0) * e, y: v.P.y };       // o puxao para o lado se desfaz junto
        this._desenhar();
        if (u < 1) this._raf = requestAnimationFrame(passo); else fim();
      };
      this._raf = requestAnimationFrame(passo);
    }

    prox() {
      if (this.vira) { this.fila = Math.min(this.fila + 1, 3); return; }
      if (this.k >= this.N) return;
      const G = { x: this.S * 0.38, y: this.S };
      this._comecar(this.k, G, { x: G.x - this.S * 0.1, y: G.y });
      this.vira.phi = 0; this.curl.phi = 0;
      this._animar(Math.PI, DUR, () => this._terminar(true));
    }
    ant() {
      if (this.vira) { this.fila = Math.max(this.fila - 1, -3); return; }
      if (this.k <= 0) return;
      const G = { x: this.S * 0.38, y: this.S };
      this._comecar(this.k - 1, G, { x: G.x - this.S * 0.1, y: -G.y });
      this.vira.phi = Math.PI; this.curl.phi = Math.PI;
      this._animar(0, DUR, () => this._terminar(false));
    }
    ir(alvo) { // pula direto (sem animar cada folha)
      cancelAnimationFrame(this._raf);
      this.vira = null; this.fila = 0; this.curl.visivel(false);
      this.k = Math.max(0, Math.min(this.N, alvo)); this.render();
    }

    _eventos() {
      const el = this.el;
      el.addEventListener('pointerdown', (e) => {
        if (this.vira || e.button > 0) return;
        const r = el.getBoundingClientRect();
        const z = this.z || 1;
        const cx = r.left + r.width / 2, h = r.top + r.height / 2;   // dobradica (centro), fixa durante o arrasto
        const p = { x: (e.clientX - cx) / z, y: (e.clientY - h) / z };
        if (Math.abs(p.x) > this.S / 2) return;
        let i, G;
        if (p.y >= 0 && this.k < this.N) { i = this.k; G = { ...p }; }
        else if (p.y < 0 && this.k > 0) { i = this.k - 1; G = { x: p.x, y: -p.y }; }
        else return;
        G.y = Math.max(G.y, this.S * 0.2);
        el.setPointerCapture(e.pointerId);
        // a folha comeca exatamente parada; so o quanto o mouse anda e que move a folha
        const P0 = { x: G.x, y: i === this.k ? G.y : -G.y };
        this._arr = { cx, h, z, x0: e.clientX, y0: e.clientY, P0, mexeu: false, ult: [] };
        this._comecar(i, G, { ...P0 });
        el.classList.add('pegando');
      });
      el.addEventListener('pointermove', (e) => {
        const a = this._arr; if (!a || !this.vira) return;
        if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) > 4) a.mexeu = true;
        this.vira.P = { x: a.P0.x + (e.clientX - a.x0) / a.z, y: a.P0.y + (e.clientY - a.y0) / a.z };
        this._desenhar();
        a.ult.push([performance.now(), this.vira.t]); if (a.ult.length > 5) a.ult.shift();
      });
      const solta = () => {
        const a = this._arr; if (!a) return;
        this._arr = null;
        el.classList.remove('pegando');
        const v = this.vira; if (!v) return;
        let virou;
        if (!a.mexeu) virou = v.i === this.k;              // clique: embaixo vira, em cima volta
        else {
          const p0 = a.ult[0], p1 = a.ult[a.ult.length - 1];
          const vel = p1 && p0 && p1[0] > p0[0] ? (p1[1] - p0[1]) / (p1[0] - p0[0]) * 1000 : 0;
          virou = Math.abs(vel) > 1.2 ? vel > 0 : v.t > 0.5;
        }
        const falta = Math.abs((virou ? 1 : 0) - v.t);
        this._animar(virou ? Math.PI : 0, Math.max(650, DUR * 1.2 * falta), () => this._terminar(virou), true);
      };
      el.addEventListener('pointerup', solta);
      el.addEventListener('pointercancel', solta);
    }
  }
  window.Livro = Livro;
})();
