/* ============================================================
   WeatherBackground — Canvas particle engine
   Live weather animations: snow, rain, thunder, sun, night, clouds, fog
   ============================================================ */

class WeatherBackground {
  /**
   * @param {string} canvasId - id of the <canvas> element
   */
  constructor(canvasId) {
    this.canvas  = document.getElementById(canvasId);
    this.ctx     = this.canvas.getContext('2d');
    this.animId  = null;
    this.time    = 0;

    // Per-condition particle arrays & state
    this.particles     = [];
    this.clouds        = [];
    this.stars         = [];
    this.condition     = null;
    this.lightningCd   = 0;   // countdown frames until next lightning
    this.lightningLife = 0;   // flash intensity (0-1)

    this._setupResize();
  }

  // ── Resize handling ─────────────────────────────────────────
  _setupResize() {
    const sync = () => {
      const p = this.canvas.parentElement;
      if (!p) return;
      this.canvas.width  = p.offsetWidth;
      this.canvas.height = p.offsetHeight;
      // Rebuild position-dependent structures
      if (this.condition === '01n') this._buildStars();
      if (['02d','02n','03d','03n','04d','04n'].includes(this.condition)) this._buildClouds();
    };
    const ro = new ResizeObserver(sync);
    ro.observe(this.canvas.parentElement);
    sync();
  }

  // ── Public: set weather condition ────────────────────────────
  /**
   * @param {string} iconCode - OWM icon code e.g. '01d', '13n'
   */
  setCondition(iconCode) {
    this.condition     = iconCode;
    this.particles     = [];
    this.clouds        = [];
    this.stars         = [];
    this.lightningLife = 0;
    cancelAnimationFrame(this.animId);

    switch (true) {
      case iconCode === '01n':
        this._buildStars(); break;
      case /^(02|03|04)[dn]$/.test(iconCode):
        this._buildClouds(); break;
      case /^13[dn]$/.test(iconCode):
        this._buildSnow(); break;
      case /^(09|10)[dn]$/.test(iconCode):
        this._buildRain(false); break;
      case /^11[dn]$/.test(iconCode):
        this._buildRain(true); break;
      case /^50[dn]$/.test(iconCode):
        this._buildFog(); break;
      // 01d (sunny) & others are purely drawn — no pre-built particles needed
    }

    this._loop();
  }

  destroy() { cancelAnimationFrame(this.animId); }

  // ── Particle builders ────────────────────────────────────────
  _buildStars() {
    const W = this.canvas.width, H = this.canvas.height;
    this.stars = Array.from({ length: 140 }, () => ({
      x:     Math.random() * W,
      y:     Math.random() * H,
      r:     Math.random() * 1.4 + 0.2,
      phase: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.025 + 0.008,
    }));
  }

  _buildClouds() {
    const W = this.canvas.width, H = this.canvas.height;
    this.clouds = Array.from({ length: 6 }, (_, i) => ({
      x:       (i / 6) * W * 1.6 - W * 0.15,
      y:       Math.random() * H * 0.55 + 10,
      w:       130 + Math.random() * 110,
      h:        55 + Math.random() * 40,
      speed:   0.25 + Math.random() * 0.35,
      opacity: 0.13 + Math.random() * 0.22,
    }));
  }

  _buildSnow() {
    this.particles = Array.from({ length: 130 }, () => this._snowflake(false));
  }

  _snowflake(fromTop) {
    const W = this.canvas.width, H = this.canvas.height;
    return {
      x:        Math.random() * W,
      y:        fromTop ? -8 : Math.random() * H,
      r:        Math.random() * 2.8 + 0.8,
      vy:       Math.random() * 1.2 + 0.4,
      swing:    Math.random() * Math.PI * 2,
      swingSpd: Math.random() * 0.022 + 0.006,
      swingAmp: Math.random() * 1.6 + 0.6,
      opacity:  Math.random() * 0.55 + 0.35,
    };
  }

  _buildRain(heavy) {
    const count = heavy ? 220 : 130;
    this.particles = Array.from({ length: count }, () => this._raindrop(true));
    this.lightningCd = heavy ? 100 + Math.random() * 150 : Infinity;
  }

  _raindrop(random) {
    const W = this.canvas.width, H = this.canvas.height;
    return {
      x:       Math.random() * (W + 60),
      y:       random ? Math.random() * H : -20,
      len:     Math.random() * 18 + 10,
      speed:   Math.random() * 9 + 14,
      opacity: Math.random() * 0.35 + 0.15,
    };
  }

  _buildFog() {
    const W = this.canvas.width, H = this.canvas.height;
    this.particles = Array.from({ length: 35 }, () => ({
      x:       Math.random() * W,
      y:       Math.random() * H,
      r:       Math.random() * 90 + 50,
      speed:   Math.random() * 0.28 + 0.08,
      opacity: Math.random() * 0.12 + 0.04,
    }));
  }

  // ── Render loop ──────────────────────────────────────────────
  _loop() {
    this.animId = requestAnimationFrame(() => this._loop());
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    this.time++;

    this._drawSky(W, H);

    switch (true) {
      case this.condition === '01d':                       this._drawSunny(W, H);       break;
      case this.condition === '01n':                       this._drawNight(W, H);       break;
      case /^(02|03|04)d$/.test(this.condition):          this._drawCloudy(W, H, 'day');   break;
      case /^(02|03|04)n$/.test(this.condition):          this._drawCloudy(W, H, 'night'); break;
      case /^(09|10)[dn]$/.test(this.condition):          this._drawRain(W, H);        break;
      case /^11[dn]$/.test(this.condition):               this._drawStorm(W, H);       break;
      case /^13[dn]$/.test(this.condition):               this._drawSnow(W, H);        break;
      case /^50[dn]$/.test(this.condition):               this._drawFog(W, H);         break;
    }
  }

  // ── Sky gradients ────────────────────────────────────────────
  _drawSky(W, H) {
    const ctx = this.ctx;
    const g   = ctx.createLinearGradient(0, 0, 0, H);
    const c   = this.condition ?? '01d';

    if      (/^13/.test(c))         { g.addColorStop(0,'#8faec8'); g.addColorStop(1,'#aac4d8'); } // snow
    else if (/^11/.test(c))         { g.addColorStop(0,'#0d0d1a'); g.addColorStop(1,'#1a1a2e'); } // storm
    else if (/^(09|10)/.test(c))    { g.addColorStop(0,'#1e2d3d'); g.addColorStop(1,'#2c3e50'); } // rain
    else if (c === '01d')           { g.addColorStop(0,'#0e4fa3'); g.addColorStop(0.6,'#2e8fe0'); g.addColorStop(1,'#5cb8f5'); } // sunny
    else if (c === '01n')           { g.addColorStop(0,'#06041a'); g.addColorStop(1,'#0f0a2e'); } // night
    else if (/^50/.test(c))         { g.addColorStop(0,'#8e9ea8'); g.addColorStop(1,'#a6b4bb'); } // fog
    else if (/^(02|03|04)d/.test(c)){ g.addColorStop(0,'#2f6fa8'); g.addColorStop(1,'#5a9dd5'); } // cloudy day
    else                             { g.addColorStop(0,'#0a1828'); g.addColorStop(1,'#132038'); } // cloudy night

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Sunny day ────────────────────────────────────────────────
  _drawSunny(W, H) {
    const ctx = this.ctx;
    const t   = this.time * 0.012;
    const cx  = W * 0.72;
    const cy  = H * 0.22;

    // Atmospheric scatter
    const scatter = ctx.createRadialGradient(cx, cy, 0, cx, cy, H * 0.9);
    scatter.addColorStop(0, `rgba(255,210,80,${0.18 + Math.sin(t) * 0.03})`);
    scatter.addColorStop(1, 'rgba(255,160,0,0)');
    ctx.fillStyle = scatter;
    ctx.fillRect(0, 0, W, H);

    // Rays
    const numRays = 10;
    for (let i = 0; i < numRays; i++) {
      const a    = (i / numRays) * Math.PI * 2 + t;
      const r0   = 42;
      const r1   = 60 + Math.sin(t * 2.5 + i * 1.3) * 9;
      const fade = 0.55 + Math.sin(t * 1.8 + i) * 0.2;
      ctx.strokeStyle = `rgba(255,235,110,${fade})`;
      ctx.lineWidth   = 3.5;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }

    // Core glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 80);
    glow.addColorStop(0, `rgba(255,248,160,${0.85 + Math.sin(t * 3) * 0.06})`);
    glow.addColorStop(0.35, 'rgba(255,220,80,0.4)');
    glow.addColorStop(1,    'rgba(255,180,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fill();

    // Disk
    ctx.fillStyle = `rgba(255,252,180,${0.96})`;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();

    // Lens flare streak
    ctx.save();
    ctx.globalAlpha = 0.06 + Math.sin(t * 0.6) * 0.02;
    const lf = ctx.createLinearGradient(cx - 100, cy - 50, cx + 130, cy + 70);
    lf.addColorStop(0, 'rgba(255,255,255,0)');
    lf.addColorStop(0.5, 'rgba(255,255,255,1)');
    lf.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lf;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.5);
    ctx.fillRect(-180, -25, 360, 50);
    ctx.restore();
    ctx.restore();
  }

  // ── Clear night ──────────────────────────────────────────────
  _drawNight(W, H) {
    const ctx = this.ctx;
    const t   = this.time;

    // Stars
    for (const s of this.stars) {
      const op = 0.4 + 0.6 * Math.abs(Math.sin(s.phase + t * s.speed));
      ctx.fillStyle = `rgba(255,255,255,${op})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Moon glow
    const mx = W * 0.68, my = H * 0.2;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 55);
    mg.addColorStop(0, 'rgba(255,255,210,0.25)');
    mg.addColorStop(1, 'rgba(255,255,180,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, 55, 0, Math.PI * 2);
    ctx.fill();

    // Moon disk
    ctx.fillStyle = 'rgba(245,245,215,0.92)';
    ctx.beginPath();
    ctx.arc(mx, my, 17, 0, Math.PI * 2);
    ctx.fill();

    // Crescent cutout
    ctx.fillStyle = 'rgba(6,4,26,0.88)';
    ctx.beginPath();
    ctx.arc(mx + 10, my - 3, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Cloudy ───────────────────────────────────────────────────
  _drawCloudy(W, H, time) {
    if (time === 'night') this._drawNight(W, H);
    else { /* daytime light handled by sky */ }

    for (const c of this.clouds) {
      c.x += c.speed;
      if (c.x > W + c.w + 20) c.x = -c.w - 20;

      this.ctx.save();
      this.ctx.globalAlpha = c.opacity;
      this._puffCloud(c.x, c.y, c.w, c.h);
      this.ctx.restore();
    }
  }

  _puffCloud(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    // bottom ellipse (body)
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.72, w * 0.48, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // left puff
    ctx.beginPath();
    ctx.ellipse(x + w * 0.28, y + h * 0.55, w * 0.26, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    // centre puff (top)
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.38, w * 0.3, h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    // right puff
    ctx.beginPath();
    ctx.ellipse(x + w * 0.72, y + h * 0.52, w * 0.24, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Snow ─────────────────────────────────────────────────────
  _drawSnow(W, H) {
    const ctx = this.ctx;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.swing += p.swingSpd;
      p.x     += Math.sin(p.swing) * p.swingAmp;
      p.y     += p.vy;

      if (p.y > H + 12) {
        this.particles[i] = this._snowflake(true);
        continue;
      }

      // Glow halo
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.8);
      halo.addColorStop(0, `rgba(230,240,255,${p.opacity * 0.55})`);
      halo.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft snow layer at bottom
    const snow = ctx.createLinearGradient(0, H - 28, 0, H);
    snow.addColorStop(0, 'rgba(210,225,240,0)');
    snow.addColorStop(1, 'rgba(215,228,242,0.55)');
    ctx.fillStyle = snow;
    ctx.fillRect(0, H - 28, W, 28);
  }

  // ── Rain ─────────────────────────────────────────────────────
  _drawRain(W, H) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(174,200,230,1)';
    ctx.lineWidth   = 1;
    ctx.lineCap     = 'round';

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.x -= 3.5;
      p.y += p.speed;

      if (p.y > H + p.len || p.x < -15) {
        this.particles[i]   = this._raindrop(false);
        this.particles[i].x = Math.random() * (W + 60);
        continue;
      }

      ctx.globalAlpha = p.opacity;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 3.5, p.y - p.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Thunderstorm ─────────────────────────────────────────────
  _drawStorm(W, H) {
    this._drawRain(W, H);

    // Lightning flash overlay
    if (this.lightningLife > 0) {
      this.ctx.fillStyle = `rgba(180,210,255,${this.lightningLife * 0.28})`;
      this.ctx.fillRect(0, 0, W, H);
      this.lightningLife = Math.max(0, this.lightningLife - 0.06);
    }

    // Countdown to next bolt
    this.lightningCd--;
    if (this.lightningCd <= 0) {
      this._strikeLightning(W, H);
      this.lightningLife = 1;
      this.lightningCd   = 90 + Math.random() * 200;
    }
  }

  _strikeLightning(W, H) {
    const ctx = this.ctx;
    let x = W * 0.2 + Math.random() * W * 0.6;
    let y = 0;

    ctx.save();
    ctx.strokeStyle = 'rgba(210,230,255,0.92)';
    ctx.lineWidth   = 1.8;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = 'rgba(160,190,255,1)';
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);

    while (y < H * 0.65) {
      x += (Math.random() - 0.48) * 28;
      y += Math.random() * 22 + 10;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Bright branch
    ctx.strokeStyle = 'rgba(240,248,255,0.6)';
    ctx.lineWidth   = 0.8;
    const bx = x, by = y;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    let bx2 = bx, by2 = by;
    for (let i = 0; i < 4; i++) {
      bx2 += (Math.random() - 0.5) * 20;
      by2 += Math.random() * 15 + 8;
      ctx.lineTo(bx2, by2);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Fog ──────────────────────────────────────────────────────
  _drawFog(W, H) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      p.x += p.speed;
      if (p.x - p.r > W) p.x = -p.r;

      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(200,210,218,${p.opacity})`);
      g.addColorStop(1, 'rgba(200,210,218,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground mist
    const mist = ctx.createLinearGradient(0, H * 0.55, 0, H);
    mist.addColorStop(0, 'rgba(190,204,212,0)');
    mist.addColorStop(1, 'rgba(190,204,212,0.55)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, H * 0.55, W, H);
  }
}

// Export as global
window.WeatherBackground = WeatherBackground;
