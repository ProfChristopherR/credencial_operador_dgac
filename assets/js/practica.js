/**
 * ============================================
   CLASE 7 - PRÁCTICA DE VUELO (DJI Mini 2)
   - Simulador interactivo Modo 2
   - Motor de animaciones de maniobras (los sticks se
     calculan automáticamente a partir de la trayectoria)
   - Checklists interactivos (localStorage) + impresión
   ============================================
 */
(function () {
  'use strict';

  const FPS = 60;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Utilidades ---------- */
  const easeIO = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const rad = d => (d * Math.PI) / 180;
  const deg = r => (r * 180) / Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Rumbo: 0° = nariz hacia arriba de la pantalla (alejándose del piloto), sentido horario
  const headingOf = (dx, dy) => deg(Math.atan2(dx, -dy));

  /* ---------- Gráficos del dron ---------- */
  function droneTopMarkup() {
    const rotors = [[-13, -11], [13, -11], [-13, 11], [13, 11]]
      .map(([x, y]) => `<circle class="dr-prop" cx="${x}" cy="${y}" r="8"/><line class="dr-blade" x1="${x - 7}" y1="${y}" x2="${x + 7}" y2="${y}"/>`)
      .join('');
    return `
      <g class="dr-rot">
        <line class="dr-arm" x1="-13" y1="-11" x2="13" y2="11"/>
        <line class="dr-arm" x1="13" y1="-11" x2="-13" y2="11"/>
        ${rotors}
        <rect class="dr-body" x="-6" y="-11" width="12" height="22" rx="5"/>
        <circle class="dr-led" cx="0" cy="8" r="1.6"/>
        <circle class="dr-cam" cx="0" cy="-12" r="3"/>
        <path class="dr-front" d="M0,-28 l-4.5,6.5 h9z"/>
      </g>`;
  }

  function droneSideMarkup() {
    return `
      <g class="dr-tilt">
        <line class="dr-arm" x1="-17" y1="-4" x2="17" y2="-4"/>
        <ellipse class="dr-prop" cx="-17" cy="-8" rx="11" ry="2.4"/>
        <ellipse class="dr-prop" cx="17" cy="-8" rx="11" ry="2.4"/>
        <rect class="dr-body" x="-13" y="-5" width="26" height="10" rx="4.5"/>
        <circle class="dr-cam" cx="13" cy="5" r="3.2"/>
      </g>`;
  }

  function pilotMarkup(x, y) {
    return `
      <g transform="translate(${x},${y})">
        <circle class="g-pilot" cx="0" cy="-14" r="5"/>
        <path class="g-pilot" d="M-7,4 Q-7,-8 0,-8 Q7,-8 7,4 Z"/>
        <rect x="-6" y="-6" width="12" height="5" rx="1.5" fill="var(--accent)"/>
        <text class="g-label" x="0" y="8" text-anchor="middle">PILOTO</text>
      </g>`;
  }

  function topGround(w, h, opts = {}) {
    let grid = '';
    for (let x = 20; x < w; x += 20) grid += `<line class="g-grid" x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
    for (let y = 20; y < h; y += 20) grid += `<line class="g-grid" x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
    const zone = opts.zone || { x: 30, y: 16, w: w - 60, h: h - 62 };
    return `
      <rect class="g-ground" width="${w}" height="${h}"/>
      ${grid}
      <rect class="g-zone" x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="10"/>
      <text class="g-label" x="${zone.x + 8}" y="${zone.y + zone.h - 8}">ZONA DE VUELO</text>`;
  }

  function sideScene(w, h, gy) {
    return `
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--accent-soft)"/>
          <stop offset="1" stop-color="var(--bg-secondary)"/>
        </linearGradient>
      </defs>
      <rect class="g-sky" width="${w}" height="${gy}"/>
      <rect class="g-ground-side" y="${gy}" width="${w}" height="${h - gy}"/>
      <text class="g-label" x="8" y="${h - 8}">VISTA LATERAL</text>`;
  }

  function treeMarkup(x, gy) {
    return `
      <g>
        <rect class="g-tree-trunk" x="${x - 4}" y="${gy - 34}" width="8" height="34" rx="2"/>
        <circle class="g-tree-top" cx="${x}" cy="${gy - 52}" r="24"/>
        <circle class="g-tree-top" cx="${x - 14}" cy="${gy - 40}" r="14"/>
        <circle class="g-tree-top" cx="${x + 14}" cy="${gy - 40}" r="14"/>
      </g>
      <text class="g-label" x="${x - 26}" y="${gy + 16}">OBJETIVO</text>`;
  }

  function targetTopMarkup(x, y) {
    return `
      <circle cx="${x}" cy="${y}" r="16" fill="none" stroke="var(--danger)" stroke-width="2" stroke-dasharray="4 3"/>
      <circle class="g-target" cx="${x}" cy="${y}" r="7"/>
      <text class="g-label" x="${x + 20}" y="${y + 4}">OBJETIVO</text>`;
  }

  /* ---------- Constructores de segmentos ---------- */
  const seg = {
    hold: (d, label) => ({ d, label, f: (u, p) => ({ ...p }) }),
    move: (dx, dy, d, label, dz = 0) => ({
      d, label,
      f: (u, p) => {
        const e = easeIO(u);
        return { ...p, x: p.x + dx * e, y: p.y + dy * e, z: p.z + dz * e };
      }
    }),
    climb: (dz, d, label) => seg.move(0, 0, d, label, dz),
    yaw: (dh, d, label) => ({ d, label, f: (u, p) => ({ ...p, h: p.h + dh * easeIO(u) }) }),
    yawTo: (ht, d, label) => ({
      d, label,
      f: (u, p) => {
        const dd = ((((ht - p.h) % 360) + 540) % 360) - 180;
        return { ...p, h: p.h + dd * easeIO(u) };
      }
    }),
    arc: (cx, cy, sweep, d, label, mode) => ({
      d, label,
      f: (u, p) => {
        const a0 = Math.atan2(p.y - cy, p.x - cx);
        const r = Math.hypot(p.x - cx, p.y - cy);
        const a = a0 + rad(sweep) * easeIO(u);
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        let h = p.h;
        if (mode === 'tangent') {
          const s = Math.sign(sweep);
          h = headingOf(-Math.sin(a) * s, Math.cos(a) * s);
        } else if (mode === 'center') {
          h = headingOf(cx - x, cy - y);
        }
        return { ...p, x, y, h };
      }
    }),
    param: (fn, d, label) => ({
      d, label,
      f: (u, p) => {
        const q = fn(u);
        const a = fn(Math.max(0, u - 0.002));
        const b = fn(Math.min(1, u + 0.002));
        return { ...p, x: q.x, y: q.y, h: headingOf(b.x - a.x, b.y - a.y) };
      }
    })
  };

  function build(start, segs) {
    const out = [];
    let p = { ...start };
    segs.forEach(s => {
      const n = Math.max(1, Math.round(s.d * FPS));
      for (let i = 0; i < n; i++) {
        const q = s.f(i / n, p);
        q.label = s.label;
        out.push(q);
      }
      p = { ...s.f(1, p) };
    });
    out.push({ ...p, label: segs[segs.length - 1].label });
    // Desenrollar el rumbo para evitar saltos de 360°
    for (let i = 1; i < out.length; i++) {
      let d = out[i].h - out[i - 1].h;
      while (d > 180) { out[i].h -= 360; d -= 360; }
      while (d < -180) { out[i].h += 360; d += 360; }
    }
    return out;
  }

  // Deriva las entradas de sticks (Modo 2) a partir del movimiento
  function deriveSticks(samples, view) {
    const n = samples.length;
    const raw = samples.map((s, i) => {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      const a = samples[i0];
      const b = samples[i1];
      const dt = (i1 - i0) / FPS || 1 / FPS;
      const vx = (b.x - a.x) / dt;
      const vy = (b.y - a.y) / dt;
      let p, r;
      if (view === 'side') {
        p = vx; r = 0;
      } else {
        const hr = rad(s.h);
        p = vx * Math.sin(hr) - vy * Math.cos(hr);
        r = vx * Math.cos(hr) + vy * Math.sin(hr);
      }
      return { t: (b.z - a.z) / dt, y: (b.h - a.h) / dt, p, r };
    });
    const max = { t: 0, y: 0, h: 0 };
    raw.forEach(o => {
      max.t = Math.max(max.t, Math.abs(o.t));
      max.y = Math.max(max.y, Math.abs(o.y));
      max.h = Math.max(max.h, Math.abs(o.p), Math.abs(o.r));
    });
    const norm = (v, m) => (m > 1e-3 ? clamp((v / m) * 0.9, -1, 1) : 0);
    return raw.map(o => ({
      t: norm(o.t, max.t),
      y: norm(o.y, max.y),
      p: norm(o.p, max.h),
      r: norm(o.r, max.h)
    }));
  }

  /* ---------- Definición de ejercicios ---------- */
  const GY = 190; // suelo en vista lateral

  const eightFn = u => {
    const t = u * Math.PI * 2;
    return { x: 200 + 140 * Math.sin(t), y: 135 - 150 * Math.sin(t) * Math.cos(t) };
  };
  const eightH0 = (() => { const a = eightFn(0), b = eightFn(0.002); return headingOf(b.x - a.x, b.y - a.y); })();

  const EXERCISES = {
    takeoff: {
      view: 'side',
      start: { x: 200, y: 0, z: 0, h: 0 },
      segs: [
        seg.hold(1, 'Motores encendidos, dron en tierra'),
        seg.climb(70, 2.6, 'Throttle arriba, suave y progresivo'),
        seg.hold(1.6, 'Hover a ~1,5 m: verifica que esté estable'),
        seg.climb(-70, 3.2, 'Throttle abajo, suave'),
        seg.hold(1.2, 'Throttle abajo hasta que se detengan los motores')
      ]
    },
    line: {
      view: 'top',
      start: { x: 200, y: 215, z: 1, h: 0 },
      segs: [
        seg.hold(0.6, 'Hover en posición'),
        seg.move(0, -160, 2.8, 'Pitch adelante: acelera y frena suave'),
        seg.hold(0.9, 'Stick al centro: detención'),
        seg.move(0, 160, 2.8, 'Pitch atrás: regreso y frenado suave'),
        seg.hold(0.9, 'Detención en el punto de partida')
      ]
    },
    square: {
      view: 'top',
      start: { x: 120, y: 210, z: 1, h: 0 },
      segs: [
        seg.hold(0.5, 'Nariz al frente (cola hacia ti)'),
        seg.move(0, -140, 2.2, 'Pitch adelante'),
        seg.hold(0.4, 'Detenerse'),
        seg.move(160, 0, 2.4, 'Roll derecha'),
        seg.hold(0.4, 'Detenerse'),
        seg.move(0, 140, 2.2, 'Pitch atrás'),
        seg.hold(0.4, 'Detenerse'),
        seg.move(-160, 0, 2.4, 'Roll izquierda'),
        seg.hold(0.6, 'Cuadrado completo')
      ]
    },
    squareYaw: {
      view: 'top',
      start: { x: 120, y: 210, z: 1, h: 0 },
      segs: [
        seg.move(0, -140, 2.2, 'Pitch adelante'),
        seg.yaw(90, 1.3, 'Yaw derecha 90°'),
        seg.move(160, 0, 2.4, 'Pitch adelante'),
        seg.yaw(90, 1.3, 'Yaw derecha 90°'),
        seg.move(0, 140, 2.2, 'Pitch adelante (el dron viene hacia ti)'),
        seg.yaw(90, 1.3, 'Yaw derecha 90°'),
        seg.move(-160, 0, 2.4, 'Pitch adelante'),
        seg.yaw(90, 1.3, 'Yaw derecha: vuelve a la orientación inicial')
      ]
    },
    halfmoon: {
      view: 'top',
      start: { x: 90, y: 200, z: 1, h: 0 },
      segs: [
        seg.hold(0.5, 'Inicio a la izquierda, nariz al frente'),
        seg.arc(200, 200, 180, 4.8, 'Pitch adelante + Yaw derecha (giro coordinado)', 'tangent'),
        seg.hold(0.5, 'Fin del arco: la nariz mira hacia ti'),
        seg.yaw(180, 1.6, 'Yaw 180°'),
        seg.arc(200, 200, -180, 4.8, 'Pitch adelante + Yaw izquierda', 'tangent'),
        seg.yaw(180, 1.6, 'Yaw 180°: nariz al frente')
      ]
    },
    circle: {
      view: 'top',
      start: { x: 200, y: 230, z: 1, h: 0 },
      segs: [
        seg.yaw(-90, 1.2, 'Yaw izquierda 90°'),
        seg.arc(200, 130, 360, 8.5, 'Pitch adelante + Yaw constante', 'tangent'),
        seg.yaw(90, 1.2, 'Yaw derecha: nariz al frente')
      ]
    },
    eight: {
      view: 'top',
      start: { x: 200, y: 135, z: 1, h: 0 },
      segs: [
        seg.hold(0.4, 'Inicio en el cruce del ocho'),
        seg.yawTo(eightH0, 1, 'Orienta la nariz hacia la trayectoria'),
        seg.param(eightFn, 11, 'Pitch adelante + Yaw (cambia de sentido en el cruce)'),
        seg.yawTo(0, 1, 'Nariz al frente')
      ]
    },
    ladder: {
      view: 'side',
      start: { x: 50, y: 0, z: 0, h: 0 },
      segs: [
        seg.climb(40, 1.5, 'Throttle arriba'),
        seg.move(80, 0, 1.6, 'Pitch adelante'),
        seg.climb(40, 1.5, 'Throttle arriba'),
        seg.move(80, 0, 1.6, 'Pitch adelante'),
        seg.climb(40, 1.5, 'Throttle arriba'),
        seg.move(80, 0, 1.6, 'Pitch adelante'),
        seg.hold(0.6, 'Hover en el último escalón'),
        seg.move(-240, -120, 5, 'Descenso en diagonal (pitch atrás + throttle abajo)'),
        seg.hold(0.8, 'Aterrizaje')
      ]
    },
    pullin: {
      view: 'side',
      target: true,
      angleTag: '📐 Descenso diagonal (~25°–30°): Pitch ▲ + Throttle ▼',
      start: { x: 50, y: 0, z: 125, h: 0 },
      segs: [
        seg.hold(0.8, 'Inicio elevado: encuadra objetivo con cámara a ~30°'),
        seg.move(200, 0, 5.5, 'Descenso diagonal (~25°–30°): Pitch adelante + Throttle abajo', -95),
        seg.hold(1.2, 'Frenado suave a distancia segura del objetivo'),
        seg.move(-200, 0, 3.2, 'Regreso al punto elevado inicial', 95)
      ]
    },
    pullback: {
      view: 'side',
      target: true,
      angleTag: '📐 Ascenso diagonal (~25°–30°): Pitch ▼ + Throttle ▲',
      start: { x: 250, y: 0, z: 30, h: 0 },
      segs: [
        seg.hold(0.8, 'Inicio bajo y cercano: objetivo bien encuadrado'),
        seg.move(-200, 0, 5.5, 'Ascenso diagonal (~25°–30°): Pitch atrás + Throttle arriba', 95),
        seg.hold(1.2, 'Detención suave revelando el entorno amplio'),
        seg.move(200, 0, 3.2, 'Regreso al punto bajo inicial', -95)
      ]
    },
    orbit: {
      view: 'top',
      target: { x: 200, y: 125 },
      angleTag: '📐 Órbita cinematográfica con cámara a ~30°',
      start: { x: 200, y: 225, z: 2.5, h: 0 },
      segs: [
        seg.hold(0.8, 'Dron elevado con cámara inclinada a ~30° hacia el objetivo'),
        seg.arc(200, 125, 360, 11, 'Órbita a 30°: Roll izquierda + Yaw derecha constante', 'center'),
        seg.hold(0.8, 'Órbita completa de 360°')
      ]
    }
  };

  /* ---------- Reproductor de maniobras ---------- */
  const players = [];

  function miniStick(caption) {
    return `
      <figure>
        <svg viewBox="0 0 60 60" aria-hidden="true">
          <rect class="well" x="3" y="3" width="54" height="54" rx="14"/>
          <line class="cross" x1="30" y1="8" x2="30" y2="52"/>
          <line class="cross" x1="8" y1="30" x2="52" y2="30"/>
          <circle class="knob" cx="30" cy="30" r="8"/>
        </svg>
        <figcaption>${caption}</figcaption>
      </figure>`;
  }

  class Player {
    constructor(host, def) {
      this.host = host;
      this.def = def;
      this.samples = build(def.start, def.segs);
      this.sticks = deriveSticks(this.samples, def.view);
      this.n = this.samples.length;
      this.t = 0;
      this.playing = !reduceMotion;
      this.visible = false;
      this.lastIdx = -1;
      this.render();
    }

    toScreen(s) {
      return this.def.view === 'side' ? { x: s.x, y: GY - 14 - s.z } : { x: s.x, y: s.y };
    }

    render() {
      const side = this.def.view === 'side';
      const W = 400;
      const H = side ? 220 : 300;
      const pts = this.samples.map(s => this.toScreen(s));
      this.cum = [0];
      for (let i = 1; i < pts.length; i++) {
        this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      }
      this.total = this.cum[this.cum.length - 1] || 1;
      const ptsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

      let scene = '';
      if (side) {
        scene = sideScene(W, H, GY);
        if (this.def.target) scene += treeMarkup(350, GY);
      } else {
        scene = topGround(W, H) + pilotMarkup(200, 290);
        if (this.def.target) scene += targetTopMarkup(this.def.target.x, this.def.target.y);
      }
      if (this.def.angleTag) {
        scene += `<text class="g-label" x="12" y="24" fill="var(--accent-dark)" font-size="11" font-weight="700">${this.def.angleTag}</text>`;
      }

      const stage = document.createElement('div');
      stage.className = 'mv-stage';
      stage.innerHTML = `
        <svg class="mv-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.host.dataset.title || 'Animación de maniobra'}">
          ${scene}
          <polyline class="g-path" points="${ptsStr}"/>
          <polyline class="g-trail" points="${ptsStr}" stroke-dasharray="${this.total}" stroke-dashoffset="${this.total}"/>
          ${this.def.target ? '<polygon class="g-cone"/>' : ''}
          ${side ? '' : '<ellipse class="dr-shadow" rx="17" ry="13"/>'}
          <g class="drone spinning">${side ? droneSideMarkup() : droneTopMarkup()}</g>
        </svg>
        <div class="mv-label">—</div>`;

      const panel = document.createElement('div');
      panel.className = 'mv-panel';
      panel.innerHTML = `
        <div class="mv-sticks">${miniStick('Izq.')}${miniStick('Der.')}</div>
        <div class="mv-chips">
          <span class="mv-chip" data-ch="t">THROTTLE</span>
          <span class="mv-chip" data-ch="y">YAW</span>
          <span class="mv-chip" data-ch="p">PITCH</span>
          <span class="mv-chip" data-ch="r">ROLL</span>
        </div>
        <div class="mv-controls">
          <button class="mv-btn" type="button" data-act="toggle" aria-label="Pausar o reproducir"></button>
          <button class="mv-btn" type="button" data-act="restart" aria-label="Reiniciar animación">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>
        </div>`;

      this.host.prepend(panel);
      this.host.prepend(stage);

      this.svg = stage.querySelector('svg');
      this.drone = stage.querySelector('.drone');
      this.inner = stage.querySelector(side ? '.dr-tilt' : '.dr-rot');
      this.shadow = stage.querySelector('.dr-shadow');
      this.trail = stage.querySelector('.g-trail');
      this.cone = stage.querySelector('.g-cone');
      this.label = stage.querySelector('.mv-label');
      const knobs = panel.querySelectorAll('.knob');
      this.knobL = knobs[0];
      this.knobR = knobs[1];
      this.chips = {};
      panel.querySelectorAll('.mv-chip').forEach(c => { this.chips[c.dataset.ch] = c; });
      this.toggleBtn = panel.querySelector('[data-act="toggle"]');
      this.updateToggleIcon();

      this.toggleBtn.addEventListener('click', () => {
        this.playing = !this.playing;
        this.updateToggleIcon();
      });
      panel.querySelector('[data-act="restart"]').addEventListener('click', () => {
        this.t = 0;
        this.playing = true;
        this.updateToggleIcon();
        this.draw(0);
      });

      this.draw(0);
    }

    updateToggleIcon() {
      this.toggleBtn.innerHTML = this.playing
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>';
    }

    tick(dt) {
      if (!this.visible) return;
      if (this.playing) this.t += dt;
      const idx = Math.floor(this.t * FPS) % this.n;
      if (idx !== this.lastIdx) this.draw(idx);
    }

    draw(i) {
      this.lastIdx = i;
      const s = this.samples[i];
      const st = this.sticks[i];
      const p = this.toScreen(s);
      const side = this.def.view === 'side';

      if (side) {
        this.drone.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
        this.inner.setAttribute('transform', `rotate(${(st.p * 12).toFixed(1)})`);
      } else {
        const sc = 0.9 + s.z * 0.12;
        this.drone.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)}) scale(${sc.toFixed(2)})`);
        this.inner.setAttribute('transform', `rotate(${s.h.toFixed(1)})`);
        if (this.shadow) {
          this.shadow.setAttribute('cx', (p.x + s.z * 6).toFixed(1));
          this.shadow.setAttribute('cy', (p.y + s.z * 9).toFixed(1));
        }
      }

      this.trail.setAttribute('stroke-dashoffset', (this.total - this.cum[i]).toFixed(1));

      if (this.cone) {
        let tx, ty, spread;
        if (side) {
          tx = 350; ty = GY - 45; spread = 42;
          const cam = { x: p.x + 13, y: p.y + 5 };
          this.cone.setAttribute('points', `${cam.x},${cam.y} ${tx},${ty - spread} ${tx},${ty + spread}`);
        } else {
          tx = this.def.target.x; ty = this.def.target.y; spread = 22;
          const dx = tx - p.x;
          const dy = ty - p.y;
          const L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L;
          const ny = dx / L;
          this.cone.setAttribute('points', `${p.x},${p.y} ${tx + nx * spread},${ty + ny * spread} ${tx - nx * spread},${ty - ny * spread}`);
        }
      }

      // Sticks Modo 2: izquierdo = yaw (x) / throttle (y) | derecho = roll (x) / pitch (y)
      this.knobL.setAttribute('transform', `translate(${(st.y * 18).toFixed(1)},${(-st.t * 18).toFixed(1)})`);
      this.knobR.setAttribute('transform', `translate(${(st.r * 18).toFixed(1)},${(-st.p * 18).toFixed(1)})`);

      const TH = 0.12;
      const arrows = {
        t: v => (v > 0 ? 'THROTTLE ▲' : 'THROTTLE ▼'),
        y: v => (v > 0 ? 'YAW ⟳' : 'YAW ⟲'),
        p: v => (v > 0 ? 'PITCH ▲' : 'PITCH ▼'),
        r: v => (v > 0 ? 'ROLL ▶' : 'ROLL ◀')
      };
      const names = { t: 'THROTTLE', y: 'YAW', p: 'PITCH', r: 'ROLL' };
      Object.keys(this.chips).forEach(k => {
        const on = Math.abs(st[k]) > TH;
        const chip = this.chips[k];
        chip.classList.toggle('on', on);
        const txt = on ? arrows[k](st[k]) : names[k];
        if (chip.textContent !== txt) chip.textContent = txt;
      });

      if (this.label.textContent !== s.label) this.label.textContent = s.label;
    }
  }

  function initPlayers() {
    document.querySelectorAll('[data-mv]').forEach(host => {
      const def = EXERCISES[host.dataset.mv];
      if (!def) return;
      const pl = new Player(host, def);
      players.push(pl);
    });

    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const pl = players.find(p => p.host === e.target);
        if (pl) pl.visible = e.isIntersecting;
      });
    }, { threshold: 0.15 });
    players.forEach(p => io.observe(p.host));
  }

  /* ---------- Simulador interactivo Modo 2 ---------- */
  const sim = {
    el: null,
    visible: false,
    tgt: { t: 0, y: 0, p: 0, r: 0 },
    st: { t: 0, y: 0, p: 0, r: 0 },
    keys: new Set(),
    zone: { x: 30, y: 16, w: 340, h: 238 },
    pad: { x: 200, y: 214 },
    reset() {
      this.tgt = { t: 0, y: 0, p: 0, r: 0 };
      this.st = { t: 0, y: 0, p: 0, r: 0 };
      this.keys.clear();
      this.s = { x: this.pad.x, y: this.pad.y, h: 0, z: 0, vx: 0, vy: 0 };
      if (this.el) {
        this.el.querySelectorAll('.dpad button.pressed').forEach(b => b.classList.remove('pressed'));
        this.el.querySelectorAll('.rc-stick.stick-active').forEach(s => s.classList.remove('stick-active'));
      }
    }
  };

  function initSim() {
    const el = document.getElementById('sim-modo2');
    if (!el) return;
    sim.el = el;
    sim.reset();

    const arena = el.querySelector('.sim-arena');
    const W = 400;
    const H = 300;
    arena.insertAdjacentHTML('afterbegin', `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vista cenital del simulador: zona de vuelo, helipuerto, piloto y dron">
        ${topGround(W, H, { zone: sim.zone })}
        <circle class="g-pad" cx="${sim.pad.x}" cy="${sim.pad.y}" r="20"/>
        <text class="g-pad-h" x="${sim.pad.x}" y="${sim.pad.y + 6}" text-anchor="middle" font-size="16">H</text>
        ${pilotMarkup(200, 290)}
        <ellipse class="dr-shadow" rx="17" ry="13"/>
        <g class="drone">${droneTopMarkup()}</g>
      </svg>`);

    sim.drone = arena.querySelector('.drone');
    sim.inner = arena.querySelector('.dr-rot');
    sim.shadow = arena.querySelector('.dr-shadow');
    sim.hudAlt = el.querySelector('[data-hud="alt"]');
    sim.hudState = el.querySelector('[data-hud="state"]');
    sim.hint = el.querySelector('.sim-hint');
    sim.knobL = el.querySelector('#rc-left .knob');
    sim.knobR = el.querySelector('#rc-right .knob');

    const keyMap = {
      KeyW: ['t', 1], KeyS: ['t', -1], KeyA: ['y', -1], KeyD: ['y', 1],
      ArrowUp: ['p', 1], ArrowDown: ['p', -1], ArrowLeft: ['r', -1], ArrowRight: ['r', 1]
    };

    const updateDpadHighlight = () => {
      el.querySelectorAll('.dpad button[data-ax]').forEach(b => {
        const ax = b.dataset.ax;
        const v = parseFloat(b.dataset.v);
        const isKey = [...sim.keys].some(c => keyMap[c] && keyMap[c][0] === ax && keyMap[c][1] === v);
        const isStick = (v > 0 && sim.tgt[ax] > 0.22) || (v < 0 && sim.tgt[ax] < -0.22);
        b.classList.toggle('pressed', isKey || isStick);
      });
    };

    // Botones D-Pad (mantener presionado / clic)
    el.querySelectorAll('.dpad button[data-ax]').forEach(btn => {
      const ax = btn.dataset.ax;
      const v = parseFloat(btn.dataset.v);
      const press = e => {
        e.preventDefault();
        sim.tgt[ax] = v;
        btn.classList.add('pressed');
        if (btn.setPointerCapture && e.pointerId !== undefined) {
          try { btn.setPointerCapture(e.pointerId); } catch (_) {}
        }
      };
      const release = () => {
        if (sim.tgt[ax] === v) sim.tgt[ax] = 0;
        btn.classList.remove('pressed');
        updateDpadHighlight();
      };
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });

    // Sticks virtuales táctiles (multitouch independiente con pulgares)
    const stickL = el.querySelector('#rc-left');
    const stickR = el.querySelector('#rc-right');

    function setupVirtualStick(svgEl, onMove, onRelease) {
      if (!svgEl) return;
      let activePointerId = null;

      function calc(e) {
        const rect = svgEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const maxR = Math.max(12, rect.width * 0.32);
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clampedDist = Math.min(dist, maxR);
        const angle = Math.atan2(dy, dx);
        const nx = (Math.cos(angle) * clampedDist) / maxR;
        const ny = (Math.sin(angle) * clampedDist) / maxR;
        return { nx, ny };
      }

      function onDown(e) {
        if (activePointerId !== null) return;
        activePointerId = e.pointerId;
        svgEl.classList.add('stick-active');
        try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
        const { nx, ny } = calc(e);
        onMove(nx, ny);
      }

      function onPointerMove(e) {
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        const { nx, ny } = calc(e);
        onMove(nx, ny);
      }

      function onUp(e) {
        if (e.pointerId !== activePointerId) return;
        activePointerId = null;
        svgEl.classList.remove('stick-active');
        try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
        onRelease();
      }

      svgEl.addEventListener('pointerdown', onDown, { passive: false });
      svgEl.addEventListener('pointermove', onPointerMove, { passive: false });
      svgEl.addEventListener('pointerup', onUp, { passive: false });
      svgEl.addEventListener('pointercancel', onUp, { passive: false });
      svgEl.addEventListener('lostpointercapture', onUp, { passive: false });
      svgEl.addEventListener('contextmenu', e => e.preventDefault());
    }

    // Stick Izquierdo (Modo 2): X -> Yaw, Y -> Throttle (arriba = acelerar)
    setupVirtualStick(
      stickL,
      (nx, ny) => {
        sim.tgt.y = clamp(nx, -1, 1);
        sim.tgt.t = clamp(-ny, -1, 1);
        updateDpadHighlight();
      },
      () => {
        sim.tgt.y = 0;
        sim.tgt.t = 0;
        updateDpadHighlight();
      }
    );

    // Stick Derecho (Modo 2): X -> Roll, Y -> Pitch (arriba = adelante)
    setupVirtualStick(
      stickR,
      (nx, ny) => {
        sim.tgt.r = clamp(nx, -1, 1);
        sim.tgt.p = clamp(-ny, -1, 1);
        updateDpadHighlight();
      },
      () => {
        sim.tgt.r = 0;
        sim.tgt.p = 0;
        updateDpadHighlight();
      }
    );

    // Teclado (cuando el simulador tiene el foco)
    const applyKeys = () => {
      ['t', 'y', 'p', 'r'].forEach(ax => { sim.tgt[ax] = 0; });
      sim.keys.forEach(code => {
        const m = keyMap[code];
        if (m) sim.tgt[m[0]] = m[1];
      });
      updateDpadHighlight();
    };

    el.addEventListener('keydown', e => {
      if (keyMap[e.code]) {
        e.preventDefault();
        sim.keys.add(e.code);
        applyKeys();
      }
    });
    el.addEventListener('keyup', e => {
      if (keyMap[e.code]) {
        sim.keys.delete(e.code);
        applyKeys();
      }
    });
    el.addEventListener('blur', () => { sim.keys.clear(); applyKeys(); });
    arena.addEventListener('pointerdown', () => el.focus({ preventScroll: true }));

    el.querySelector('[data-sim="reset"]').addEventListener('click', () => {
      sim.reset();
      updateDpadHighlight();
      drawSim();
    });

    new IntersectionObserver(entries => {
      sim.visible = entries[0].isIntersecting;
    }, { threshold: 0.1 }).observe(el);

    drawSim();
  }

  function stepSim(dt) {
    if (!sim.el || !sim.visible) return;
    const k = Math.min(1, dt * 9);
    ['t', 'y', 'p', 'r'].forEach(ax => { sim.st[ax] += (sim.tgt[ax] - sim.st[ax]) * k; });
    const s = sim.s;
    const st = sim.st;
    const grounded = s.z <= 0.001;

    if (grounded && st.t <= 0.15) {
      s.vx = 0; s.vy = 0; s.z = 0;
    } else {
      s.z = clamp(s.z + st.t * 2.2 * dt, 0, 15);
      s.h += st.y * 80 * dt;
      const V = 70;
      const hr = rad(s.h);
      const fwd = st.p * V;
      const right = st.r * V;
      const vxd = Math.sin(hr) * fwd + Math.cos(hr) * right;
      const vyd = -Math.cos(hr) * fwd + Math.sin(hr) * right;
      const inertia = Math.min(1, dt * 2.8);
      s.vx += (vxd - s.vx) * inertia;
      s.vy += (vyd - s.vy) * inertia;
      s.x = clamp(s.x + s.vx * dt, 12, 388);
      s.y = clamp(s.y + s.vy * dt, 12, 288);
    }
    drawSim();
  }

  function drawSim() {
    const s = sim.s;
    const st = sim.st;
    const flying = s.z > 0.001;
    const sc = 0.85 + Math.min(s.z, 15) * 0.035;
    sim.drone.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)}) scale(${sc.toFixed(3)})`);
    sim.inner.setAttribute('transform', `rotate(${s.h.toFixed(1)})`);
    sim.drone.classList.toggle('spinning', flying || st.t > 0.15);
    sim.shadow.setAttribute('cx', (s.x + s.z * 2.5).toFixed(1));
    sim.shadow.setAttribute('cy', (s.y + s.z * 3.5).toFixed(1));
    sim.shadow.setAttribute('opacity', Math.max(0.25, 1 - s.z * 0.05).toFixed(2));

    sim.knobL.setAttribute('transform', `translate(${(st.y * 30).toFixed(1)},${(-st.t * 30).toFixed(1)})`);
    sim.knobR.setAttribute('transform', `translate(${(st.r * 30).toFixed(1)},${(-st.p * 30).toFixed(1)})`);

    const z = sim.zone;
    const out = s.x < z.x || s.x > z.x + z.w || s.y < z.y || s.y > z.y + z.h;
    const hdg = ((Math.round(s.h) % 360) + 360) % 360;
    sim.hudAlt.textContent = `Altura ${s.z.toFixed(1)} m · Rumbo ${hdg}°`;
    let state = flying ? 'En vuelo' : 'En tierra';
    if (out && flying) state = '¡Fuera de la zona!';
    if (sim.hudState.textContent !== state) sim.hudState.textContent = state;
    sim.hudState.classList.toggle('hud-warn', out && flying);

    const facingPilot = flying && hdg > 120 && hdg < 240;
    sim.hint.classList.toggle('show', facingPilot);
  }

  /* ---------- Bucle principal ---------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    players.forEach(p => p.tick(dt));
    stepSim(dt);
    requestAnimationFrame(loop);
  }

  /* ---------- Checklists ---------- */
  function initChecklists() {
    document.querySelectorAll('.checklist[data-checklist]').forEach(cl => {
      const key = 'dgac-c7-checklist-' + cl.dataset.checklist;
      const inputs = [...cl.querySelectorAll('.check-item input')];
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { saved = []; }
      inputs.forEach((inp, i) => {
        inp.checked = !!saved[i];
        inp.addEventListener('change', update);
      });

      const fill = cl.querySelector('.cl-bar-fill');
      const count = cl.querySelector('[data-cl-count]');
      const pct = cl.querySelector('[data-cl-pct]');

      function update() {
        const done = inputs.filter(i => i.checked).length;
        const p = inputs.length ? Math.round((done / inputs.length) * 100) : 0;
        fill.style.width = p + '%';
        count.textContent = `${done} de ${inputs.length} ítems`;
        pct.textContent = p + '%';
        cl.classList.toggle('complete', done === inputs.length && inputs.length > 0);
        cl.querySelectorAll('.check-group').forEach(g => {
          const gi = [...g.querySelectorAll('input')];
          const gd = gi.filter(i => i.checked).length;
          const c = g.querySelector('.cg-count');
          if (c) c.textContent = `${gd}/${gi.length}`;
          g.classList.toggle('group-done', gd === gi.length);
        });
        try { localStorage.setItem(key, JSON.stringify(inputs.map(i => i.checked))); } catch (e) { /* sin almacenamiento */ }
      }

      const resetBtn = cl.querySelector('[data-cl-reset]');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          inputs.forEach(i => { i.checked = false; });
          update();
        });
      }
      update();
    });
  }

  /* ---------- Impresión del checklist ---------- */
  function initPrint() {
    document.querySelectorAll('[data-print-checklist]').forEach(btn => {
      btn.addEventListener('click', () => {
        const main = document.querySelector('main');
        let sheet = document.getElementById('checklists-print');
        if (sheet) sheet.remove();
        sheet = document.createElement('section');
        sheet.id = 'checklists-print';
        sheet.innerHTML = `
          <div class="print-header print-only">
            <h1>Checklist de vuelo — DJI Mini 2 · Clase 7 Práctica</h1>
            <div class="print-fields"><span>Nombre:</span><span>Curso:</span><span>Fecha:</span></div>
          </div>`;
        document.querySelectorAll('.checklist[data-checklist]').forEach(cl => {
          const title = document.createElement('div');
          title.className = 'print-cl-title';
          title.textContent = cl.dataset.title || cl.dataset.checklist;
          sheet.appendChild(title);
          const groups = cl.querySelector('.check-groups').cloneNode(true);
          groups.querySelectorAll('input').forEach(i => { i.checked = false; i.removeAttribute('id'); });
          sheet.appendChild(groups);
        });
        main.appendChild(sheet);
        document.body.classList.add('print-checklist');
        const cleanup = () => {
          document.body.classList.remove('print-checklist');
          sheet.remove();
          window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
      });
    });
  }

  /* ---------- Timeline: retraso escalonado ---------- */
  function initTimeline() {
    document.querySelectorAll('.eval-timeline li').forEach((li, i) => li.style.setProperty('--i', i));
  }

  /* ---------- Tips desplegables (misma API que el resto del sitio) ---------- */
  window.toggleTip = function (button) {
    button.classList.toggle('open');
    button.nextElementSibling.classList.toggle('show');
  };

  function init() {
    initTimeline();
    initPlayers();
    initSim();
    initChecklists();
    initPrint();
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
