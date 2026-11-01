/* 3D map for the photogrammetry tracker.
   Personal page: Cesium + Google Photorealistic 3D Tiles when MSFS_GOOGLE_MAPS_KEY is set.
   Otherwise, and always for the share build: MapLibre globe, satellite texture, Mapterhorn terrain.
   Pins stay in the layer colors. The basemap does not. */
(function () {
  function pinRgb(color) {
    const h = String(color).replace("#", "").trim();
    const full = h.length === 3 ? h.replace(/./g, "$&$&") : h;
    const n = parseInt(full, 16);
    if (!isFinite(n) || full.length !== 6) return [180, 190, 205];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function pinCanvas(color) {
    const c = document.createElement("canvas");
    // Extra transparent margin so the halo fits. Stem and ball stay the same
    // size on screen: pixelRatio is still 2, anchor is still the bottom tip.
    c.width = 96;
    c.height = 120;
    const g = c.getContext("2d");
    const x = 48;
    const y = 44;
    const rgb = pinRgb(color);
    g.lineCap = "round";
    // Stem is a quarter of the ball's brightness. The ball keeps the layer color.
    const stem = rgb.map((ch) => Math.round(ch * 0.25));
    g.strokeStyle = "rgb(" + stem[0] + "," + stem[1] + "," + stem[2] + ")";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, 114);
    g.lineTo(x, 54);
    g.stroke();
    // Halo stays the pin hue. A lift toward white turned red and green into a white glow.
    const halo = g.createRadialGradient(x, y, 12, x, y, 30);
    halo.addColorStop(0, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.9)");
    halo.addColorStop(0.4, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0.5)");
    halo.addColorStop(1, "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ",0)");
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, 30, 0, Math.PI * 2);
    g.fill();
    const rim = rgb.map((ch) => Math.round(ch * 0.62));
    const body = g.createRadialGradient(x, y, 3, x, y, 14);
    body.addColorStop(0, color);
    body.addColorStop(0.62, color);
    body.addColorStop(1, "rgb(" + rim[0] + "," + rim[1] + "," + rim[2] + ")");
    g.fillStyle = body;
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.globalCompositeOperation = "lighter";
    const led = g.createRadialGradient(x, y, 0, x, y, 7);
    led.addColorStop(0, "rgba(255,255,255,0.62)");
    led.addColorStop(0.35, "rgba(255,255,255,0.32)");
    led.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = led;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return c;
  }

  function typingTarget() {
    const a = document.activeElement;
    if (!a) return false;
    if (a.isContentEditable) return true;
    return a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT";
  }

  function installKeys(onFrame) {
    const down = new Set();
    const codeMap = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyQ: "q", KeyE: "e" };
    let shift = false;
    let boost = 1;
    function keyId(e) {
      return codeMap[e.code] || (e.key && e.key.length === 1 ? e.key.toLowerCase() : "");
    }
    function trackShift(e) {
      shift = !!e.shiftKey;
    }
    window.addEventListener("keydown", (e) => {
      trackShift(e);
      if (typingTarget() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keyId(e);
      if (k && "wasdqe".includes(k)) {
        down.add(k);
        e.preventDefault();
      }
    }, true);
    window.addEventListener("keyup", (e) => {
      down.delete(keyId(e));
      trackShift(e);
    }, true);
    window.addEventListener("blur", () => {
      down.clear();
      shift = false;
      boost = 1;
    });
    let last = performance.now();
    (function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const panning = down.has("w") || down.has("a") || down.has("s") || down.has("d");
      const zooming = down.has("q") || down.has("e");
      const boosting = shift && (panning || zooming);
      boost = approach(boost, boosting ? 24 : 1, dt, boosting ? 0.42 : 0.28);
      try {
        onFrame(down, dt, boost);
      } catch (err) {
        console.warn("keys", err);
      }
      requestAnimationFrame(loop);
    })(last);
  }

  function approach(current, target, dt, seconds) {
    const k = 1 - Math.exp(-dt / seconds);
    return current + (target - current) * k;
  }

  function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  // Screen height of the globe disk, as a fraction of the viewport.
  // Matches MapLibre: radius = worldSize / (2π cos lat), camera sits
  // cameraToCenterDistance in front of the surface point.
  function globeDiskFraction(zoom, fovDeg, height, lat) {
    const t = Math.tan(((fovDeg * Math.PI) / 180) / 2);
    const R =
      (512 * Math.pow(2, zoom)) / (2 * Math.PI) / Math.cos((lat * Math.PI) / 180);
    const cam = (0.5 * height) / t;
    const sinA = Math.min(0.999, R / (cam + R));
    const tanA = sinA / Math.sqrt(1 - sinA * sinA);
    return (2 * tanA) / t;
  }

  function zoomForDisk(target, fovDeg, height, lat) {
    let lo = 0.2;
    let hi = 3.2;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (globeDiskFraction(mid, fovDeg, height, lat) > target) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }

  const LENS_BASE = 36.87;
  const LENS_TELE = 7;
  const LENS_OPEN_ZOOM = 4.8;
  const LENS_FILL = 1.16;
  const LENS_START_EXTRA = 0.75;
  const LENS_REF_LAT = -14;

  function installLens(map) {
    let zFar = 1.9;
    let framingSet = false;
    let lensQueued = false;
    function fovFor(z) {
      if (z <= zFar) return LENS_TELE;
      if (z >= LENS_OPEN_ZOOM) return LENS_BASE;
      const t = smoothstep((z - zFar) / (LENS_OPEN_ZOOM - zFar));
      return LENS_TELE + (LENS_BASE - LENS_TELE) * t;
    }
    function lock(place) {
      const H = (map.getContainer() && map.getContainer().clientHeight) || 0;
      if (H < 64) return;
      zFar = zoomForDisk(LENS_FILL, LENS_TELE, H, LENS_REF_LAT);
      if (map.getMinZoom() < zFar - 0.001) map.setMinZoom(zFar);
      if (place && !framingSet) {
        framingSet = true;
        map.jumpTo({ zoom: zFar + LENS_START_EXTRA });
      }
    }
    function apply() {
      if (!map.setVerticalFieldOfView || !map.getVerticalFieldOfView) return;
      const next = fovFor(map.getZoom());
      const current = map.getVerticalFieldOfView();
      if (Math.abs(current - next) < 0.04) return;
      map.setVerticalFieldOfView(next);
    }
    function queue() {
      if (lensQueued) return;
      lensQueued = true;
      requestAnimationFrame(() => {
        lensQueued = false;
        try {
          apply();
        } catch (err) {
          console.warn("lens", err);
        }
      });
    }
    map.on("load", () => {
      try {
        lock(true);
        apply();
      } catch (err) {
        console.warn("lens", err);
      }
    });
    map.on("resize", () => {
      try {
        lock(false);
        apply();
      } catch (err) {
        console.warn("lens", err);
      }
    });
    map.on("zoom", queue);
  }

  function sunAt(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const day = (date.getTime() - start) / 86400000;
    const decl = -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365);
    const utc =
      date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const phi = (decl * Math.PI) / 180;
    return { sφ: Math.sin(phi), cφ: Math.cos(phi), λ: (((12 - utc) * 15 * Math.PI) / 180) };
  }

  function sunBucket(date) {
    return Math.floor(date.getTime() / 600000);
  }

  function globeScreenCenter(map) {
    const canvas = map.getCanvas();
    const H = canvas.clientHeight || 1;
    const W = canvas.clientWidth || 1;
    const pitch = (map.getPitch() * Math.PI) / 180;
    const fovDeg = map.getVerticalFieldOfView ? map.getVerticalFieldOfView() : LENS_BASE;
    const t = Math.tan(((fovDeg * Math.PI) / 180) / 2) || 0.01;
    const lat = map.getCenter().lat;
    const R =
      (512 * Math.pow(2, map.getZoom())) / (2 * Math.PI) / Math.cos((lat * Math.PI) / 180);
    const cam = (0.5 * H) / t;
    const denom = cam + R * Math.cos(pitch);
    const shift = denom > 1 ? ((R * Math.sin(pitch)) / denom / t) * (H / 2) : 0;
    return { x: W / 2, y: H / 2 + shift };
  }

  function gradeTile(img, z, x, y, sun) {
    const w = img.width;
    const h = img.height;
    const d = img.data;
    const n = Math.pow(2, z);
    const colCos = new Float64Array(w);
    for (let px = 0; px < w; px++) {
      const lng = ((x + (px + 0.5) / w) / n) * 360 - 180;
      colCos[px] = Math.cos((lng * Math.PI) / 180 - sun.λ);
    }
    for (let py = 0; py < h; py++) {
      const fy = (y + (py + 0.5) / h) / n;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * fy)));
      const sLat = Math.sin(lat);
      const cLat = Math.cos(lat);
      const row = py * w;
      for (let px = 0; px < w; px++) {
        const cosZ = sLat * sun.sφ + cLat * sun.cφ * colCos[px];
        let day = (cosZ + 0.18) / 0.52;
        if (day < 0) day = 0;
        else if (day > 1) day = 1;
        else day = day * day * (3 - 2 * day);
        const i = (row + px) * 4;
        const r = d[i] / 255;
        const g = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const nightR = l * 0.2;
        const nightG = l * 0.22;
        const nightB = l * 0.28;
        const dayR = Math.min(1, r * 1.08 + 0.07);
        const dayG = Math.min(1, g * 1.04 + 0.06);
        const dayB = Math.min(1, b * 0.98 + 0.04);
        d[i] = clamp8((nightR + (dayR - nightR) * day) * 255);
        d[i + 1] = clamp8((nightG + (dayG - nightG) * day) * 255);
        d[i + 2] = clamp8((nightB + (dayB - nightB) * day) * 255);
      }
    }
  }

  function clamp8(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (v + 0.5) | 0;
  }

  const gradeCache = new Map();
  function rememberGrade(key, data) {
    gradeCache.set(key, data);
    if (gradeCache.size > 160) gradeCache.delete(gradeCache.keys().next().value);
  }

  if (window.maplibregl && maplibregl.addProtocol && !window.__msfsGradeProtocol) {
    window.__msfsGradeProtocol = true;
    maplibregl.addProtocol("msfsgrade", (params, abort) => {
      const m = String(params.url).match(/msfsgrade:\/\/v2\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
      if (!m) return Promise.reject(new Error("grade url"));
      const bucket = +m[1];
      const z = +m[2];
      const x = +m[3];
      const y = +m[4];
      const key = bucket + "/" + z + "/" + x + "/" + y;
      const hit = gradeCache.get(key);
      if (hit) return Promise.resolve({ data: hit });
      const signal = abort && abort.signal;
      const url =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" +
        z + "/" + y + "/" + x;
      return fetch(url, { signal: signal })
        .then((res) => {
          if (!res.ok) throw new Error("esri " + res.status);
          return res.arrayBuffer();
        })
        .then((raw) => {
          return createImageBitmap(new Blob([raw])).then((bmp) => {
            const canvas = new OffscreenCanvas(bmp.width, bmp.height);
            const g = canvas.getContext("2d", { willReadFrequently: true });
            g.drawImage(bmp, 0, 0);
            if (bmp.close) bmp.close();
            const img = g.getImageData(0, 0, canvas.width, canvas.height);
            gradeTile(img, z, x, y, sunAt(new Date(bucket * 600000 + 300000)));
            g.putImageData(img, 0, 0);
            return canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 }).then((blob) => blob.arrayBuffer());
          }).catch(() => raw);
        })
        .then((data) => {
          rememberGrade(key, data);
          return { data: data };
        });
    });
  }

  function screenHits(places, project, x1, y1, x2, y2) {
    const hits = [];
    for (let i = 0; i < places.length; i++) {
      const pt = project(places[i]);
      if (!pt) continue;
      if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) hits.push(places[i]);
    }
    return hits;
  }

  function placeNameField(lang) {
    if (lang === "en") return ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
    return ["coalesce", ["get", "name:latin"], ["get", "name"]];
  }

  const POLI_LAYERS = [
    "poli-state-line",
    "poli-country-line",
    "poli-state-label",
    "poli-country-label",
  ];

  function earthStyle(grade, lang) {
    const paint = grade ? {} : { "raster-saturation": 0, "raster-contrast": 0.05 };
    const tiles = grade
      ? ["msfsgrade://v2/" + sunBucket(new Date()) + "/{z}/{x}/{y}"]
      : [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ];
    const names = placeNameField(lang);
    const off = { visibility: "none" };
    const countryLine = ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]];
    const placePoint = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
    return {
      version: 8,
      projection: { type: "globe" },
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sky: {
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.35, 5, 0.06],
      },
      sources: {
        satellite: {
          type: "raster",
          tiles: tiles,
          tileSize: 256,
          maxzoom: 19,
          attribution: "Imagery © Esri",
        },
        terrain: {
          type: "raster-dem",
          tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
          tileSize: 512,
          encoding: "terrarium",
          maxzoom: 12,
          attribution: "Terrain © Mapterhorn",
        },
        political: {
          type: "vector",
          url: "https://tiles.openfreemap.org/planet",
          attribution: "© OpenStreetMap © OpenMapTiles",
        },
      },
      layers: [
        { id: "sat", type: "raster", source: "satellite", paint: paint },
        {
          id: "poli-country-line",
          type: "line",
          source: "political",
          "source-layer": "boundary",
          filter: countryLine,
          layout: Object.assign({ "line-cap": "butt", "line-join": "round" }, off),
          paint: {
            "line-color": "#000",
            "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.78, 6, 1.1],
          },
        },
        {
          id: "poli-state-label",
          type: "symbol",
          source: "political",
          "source-layer": "place",
          minzoom: 2,
          maxzoom: 9,
          filter: ["all", placePoint, ["==", ["get", "class"], "state"]],
          layout: Object.assign({
            "text-field": names,
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 2, 11, 4, 11, 5.4, 24, 7, 32, 8.6, 38],
            "text-pitch-alignment": "viewport",
            "text-rotation-alignment": "viewport",
            "text-padding": 6,
          }, off),
          paint: {
            "text-color": "#000",
            "text-halo-width": 0,
          },
        },
        {
          id: "poli-country-label",
          type: "symbol",
          source: "political",
          "source-layer": "place",
          maxzoom: 7,
          filter: ["all", placePoint, ["==", ["get", "class"], "country"]],
          layout: Object.assign({
            "text-field": names,
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 0, 10, 3.2, 12.4, 4, 13, 5.4, 28, 6.7, 34],
            "text-pitch-alignment": "viewport",
            "text-rotation-alignment": "viewport",
            "text-padding": 8,
          }, off),
          paint: {
            "text-color": "#000",
            "text-halo-width": 0,
          },
        },
      ],
      terrain: { source: "terrain", exaggeration: 1.35 },
    };
  }

  let globeIdle = true;
  let motionOn = true;
  let resumeMotion = function () {};
  function installSun(map) {
    const host = map.getContainer() && map.getContainer().parentElement;
    if (!host) return;
    if (!document.getElementById("sun-fx-style")) {
      const st = document.createElement("style");
      st.id = "sun-fx-style";
      st.textContent = ".sun-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}.sun-tint{mix-blend-mode:multiply}";
      document.head.appendChild(st);
    }
    const tint = document.createElement("canvas");
    tint.className = "sun-fx sun-tint";
    host.appendChild(tint);
    const cvs = document.createElement("canvas");
    cvs.className = "sun-fx";
    host.appendChild(cvs);
    const ctx = cvs.getContext("2d");
    const tc = tint.getContext("2d");
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 320;
    const sg = sprite.getContext("2d");
    const auraCvs = document.createElement("canvas");
    auraCvs.width = auraCvs.height = 320;
    const ag = auraCvs.getContext("2d");
    const limbCvs = document.createElement("canvas");
    const lg = limbCvs.getContext("2d");
    const glowCvs = document.createElement("canvas");
    const gg = glowCvs.getContext("2d");
    let sunPlate = null;
    const sunPhoto = new Image();
    sunPhoto.onload = function () {
      const s = 512;
      const c = document.createElement("canvas");
      c.width = c.height = s;
      const g = c.getContext("2d");
      g.drawImage(sunPhoto, 0, 0, s, s);
      const data = g.getImageData(0, 0, s, s);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        let a = (lum - 10) / 22;
        if (a < 0) a = 0;
        else if (a > 1) a = 1;
        px[i + 3] = (a * 255) | 0;
      }
      g.putImageData(data, 0, 0);
      sunPlate = c;
    };
    sunPhoto.src = new URL("sun.jpg", document.baseURI).href;
    let dpr = 1;
    // RA/Dec in degrees. A few figures only, so the dark sky stays readable.
    const FIGURES = [
      { s: [[186.65, -63.1], [191.93, -59.69], [187.79, -57.11], [183.79, -58.75]], e: [[0, 2], [1, 3]] },
      { s: [[219.9, -60.83], [210.96, -60.37]], e: [[0, 1]] },
      { s: [[88.79, 7.41], [81.28, 6.35], [83, -0.3], [84.05, -1.2], [85.19, -1.94], [78.63, -8.2], [86.94, -9.67]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 4], [4, 6], [2, 5], [5, 6]] },
      { s: [[241.36, -19.81], [240.08, -22.62], [247.35, -26.43], [262.69, -37.3], [263.4, -37.1], [264.33, -43]], e: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
      { s: [[165.93, 61.75], [165.46, 56.38], [178.46, 53.69], [183.86, 57.03], [193.51, 55.96], [200.98, 54.93], [206.89, 49.31]], e: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] },
      { s: [[28.6, 63.67], [21.45, 60.24], [14.18, 60.72], [10.13, 56.54], [2.29, 59.15]], e: [[0, 1], [1, 2], [2, 3], [3, 4]] },
    ];
    const FIELD = [];
    let seed = 20261031;
    function rnd() {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    for (let i = 0; i < 240; i++) {
      const u = rnd();
      const v = rnd();
      FIELD.push({
        ra: u * 360,
        dec: Math.asin(v * 2 - 1) * (180 / Math.PI),
        mag: rnd(),
        ph: rnd() * 6.28,
      });
    }
    for (let i = 0; i < 56; i++) {
      const u = rnd();
      const v = rnd();
      FIELD.push({
        ra: u * 360,
        dec: Math.asin(v * 2 - 1) * (180 / Math.PI),
        mag: 0.78 + rnd() * 0.22,
        ph: rnd() * 6.28,
        boost: 1.35,
        flare: rnd() < 0.34,
      });
    }
    for (let i = 0; i < 28; i++) {
      const u = rnd();
      const v = rnd();
      FIELD.push({
        ra: u * 360,
        dec: Math.asin(v * 2 - 1) * (180 / Math.PI),
        mag: 0.9 + rnd() * 0.1,
        ph: rnd() * 6.28,
        glow: true,
      });
    }
    function gmst(date) {
      const days = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
      let deg = 280.46061837 + 360.98564736629 * days;
      deg = ((deg % 360) + 360) % 360;
      return (deg * Math.PI) / 180;
    }
    function starVec(ra, dec, g) {
      const raR = (ra * Math.PI) / 180;
      const decR = (dec * Math.PI) / 180;
      const lon = raR - g;
      const c = Math.cos(decR);
      return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(decR)];
    }

    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function frame() {
      const c = map.getCenter();
      const lat = c.lat * Math.PI / 180;
      const lon = c.lng * Math.PI / 180;
      const b = map.getBearing() * Math.PI / 180;
      const pitch = map.getPitch() * Math.PI / 180;
      const cφ = Math.cos(lat);
      const sφ = Math.sin(lat);
      const cλ = Math.cos(lon);
      const sλ = Math.sin(lon);
      const up = [cφ * cλ, cφ * sλ, sφ];
      const east = [-sλ, cλ, 0];
      const north = [-sφ * cλ, -sφ * sλ, cφ];
      const cb = Math.cos(b);
      const sb = Math.sin(b);
      const screenNorth = [
        north[0] * cb + east[0] * sb,
        north[1] * cb + east[1] * sb,
        north[2] * cb + east[2] * sb,
      ];
      const X = [
        east[0] * cb - north[0] * sb,
        east[1] * cb - north[1] * sb,
        east[2] * cb - north[2] * sb,
      ];
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      const Y = [
        screenNorth[0] * cp + up[0] * sp,
        screenNorth[1] * cp + up[1] * sp,
        screenNorth[2] * cp + up[2] * sp,
      ];
      const Z = [
        screenNorth[0] * sp - up[0] * cp,
        screenNorth[1] * sp - up[1] * cp,
        screenNorth[2] * sp - up[2] * cp,
      ];
      return { X: X, Y: Y, Z: Z, pitch: pitch };
    }

    let sunSpriteReady = false;
    function drawSprite() {
      if (sunSpriteReady) return;
      sunSpriteReady = true;
      const s = 320;
      const cx = s / 2;
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalAlpha = 1;
      sg.clearRect(0, 0, s, s);
      const bloom = sg.createRadialGradient(cx, cx, cx * 0.2, cx, cx, cx - 2);
      bloom.addColorStop(0, "rgba(255,150,30,0.45)");
      bloom.addColorStop(0.45, "rgba(255,70,0,0.2)");
      bloom.addColorStop(1, "rgba(120,16,0,0)");
      sg.fillStyle = bloom;
      sg.beginPath();
      sg.arc(cx, cx, cx - 2, 0, Math.PI * 2);
      sg.fill();
      const body = sg.createRadialGradient(cx, cx, 0, cx, cx, cx - 2);
      body.addColorStop(0, "rgba(255,255,255,1)");
      body.addColorStop(0.125, "rgba(255,255,255,1)");
      body.addColorStop(0.17, "rgba(255,236,200,1)");
      body.addColorStop(0.28, "rgba(255,150,20,0.95)");
      body.addColorStop(0.46, "rgba(255,64,0,0.55)");
      body.addColorStop(0.7, "rgba(170,24,0,0.16)");
      body.addColorStop(1, "rgba(80,8,0,0)");
      sg.fillStyle = body;
      sg.beginPath();
      sg.arc(cx, cx, cx - 2, 0, Math.PI * 2);
      sg.fill();
    }

    const craftIcon = {};
    (function buildCraftIcons() {
      function sheet(draw) {
        const s = 96;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const g = c.getContext("2d");
        g.strokeStyle = "#fff";
        g.lineWidth = 4;
        g.lineJoin = "round";
        g.lineCap = "round";
        draw(g);
        return c;
      }
      function rect(g, x, y, w, h) {
        g.strokeRect(x, y, w, h);
      }
      // Simplified station, outline. Long axis is +x, along the velocity.
      craftIcon.iss = sheetFine((g) => {
        g.lineWidth = 3.4;
        g.strokeRect(24, 46, 14, 100);
        g.strokeRect(46, 46, 14, 100);
        g.strokeRect(132, 46, 14, 100);
        g.strokeRect(154, 46, 14, 100);
        g.strokeRect(16, 88, 160, 14);
        g.strokeRect(86, 34, 20, 10);
        g.strokeRect(92, 44, 8, 12);
        g.strokeRect(82, 56, 28, 32);
        g.strokeRect(92, 102, 8, 20);
        g.strokeRect(80, 122, 32, 10);
      });
      craftIcon.hubble = sheet((g) => {
        rect(g, 40, 16, 16, 64);
        g.beginPath();
        g.ellipse(48, 16, 8, 4, 0, 0, Math.PI * 2);
        g.moveTo(8, 32);
        g.lineTo(36, 32);
        g.lineTo(36, 64);
        g.lineTo(8, 64);
        g.closePath();
        g.moveTo(60, 32);
        g.lineTo(88, 32);
        g.lineTo(88, 64);
        g.lineTo(60, 64);
        g.closePath();
        g.stroke();
      });
      craftIcon.tiangong = sheet((g) => {
        rect(g, 12, 40, 22, 16);
        rect(g, 34, 42, 28, 12);
        rect(g, 62, 40, 22, 16);
        rect(g, 42, 18, 12, 24);
        rect(g, 42, 54, 12, 24);
      });
      craftIcon.landsat = sheet((g) => {
        rect(g, 30, 34, 26, 28);
        rect(g, 56, 26, 30, 44);
        rect(g, 36, 18, 14, 16);
        g.beginPath();
        g.moveTo(56, 36);
        g.lineTo(56, 60);
        g.stroke();
      });
      craftIcon.sentinel = sheet((g) => {
        rect(g, 40, 32, 26, 30);
        rect(g, 10, 28, 30, 40);
        rect(g, 48, 12, 10, 20);
        g.beginPath();
        g.moveTo(40, 40);
        g.lineTo(40, 54);
        g.stroke();
      });
      craftIcon.gps = sheet((g) => {
        rect(g, 40, 34, 16, 28);
        rect(g, 8, 42, 32, 12);
        rect(g, 56, 42, 32, 12);
        g.beginPath();
        g.moveTo(48, 34);
        g.lineTo(48, 22);
        g.moveTo(42, 22);
        g.lineTo(54, 22);
        g.stroke();
      });
      craftIcon.goes = sheet((g) => {
        rect(g, 26, 40, 24, 22);
        rect(g, 16, 24, 20, 16);
        g.beginPath();
        g.arc(68, 50, 16, 0, Math.PI * 2);
        g.moveTo(50, 50);
        g.lineTo(52, 50);
        g.stroke();
      });
      craftIcon.starlink = sheet((g) => {
        rect(g, 14, 30, 68, 36);
        g.beginPath();
        g.moveTo(31, 30);
        g.lineTo(31, 66);
        g.moveTo(48, 30);
        g.lineTo(48, 66);
        g.moveTo(65, 30);
        g.lineTo(65, 66);
        g.moveTo(14, 48);
        g.lineTo(82, 48);
        g.stroke();
        rect(g, 40, 66, 16, 12);
      });
      // Finer sheet so the capsule shoulder and the Starship flaps survive.
      // Nose still points +x, which the painter aligns with the velocity.
      function sheetFine(draw) {
        const s = 192;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const g = c.getContext("2d");
        g.strokeStyle = "#fff";
        g.lineWidth = 3.4;
        g.lineJoin = "round";
        g.lineCap = "round";
        draw(g);
        return c;
      }
      // Top view from Illustrator/dragon.svg. Nose points +x.
      craftIcon.dragon = sheetFine((g) => {
        const hull = "M132.55,111.61l-.72-16.13c-2.6-7.36-5.32-14.52-8.27-21.67l-.87-.4c-.04-1.32-.36-2.55-.89-3.67l-1.93-4.13c-3.52-7.52-7.28-14.78-11.95-21.67-6.52-9.6-16.82-21.4-29.04-15.73-14.39,6.68-26.52,33.19-32.6,47.86-2.64,6.38-5.03,12.57-7.29,19.21-.45,3.01-.38,6.3-.52,9.5l-.73,17.29-.23,4.69c-.19,3.98,1.67,6.87,5.78,7.66h83.85c1.78-.42,3.34-.73,4.5-2.24.91-1.19,1.69-2.93,1.62-4.45l-.71-16.12ZM126.86,91.58c.09.24.1.59.08.92-.01.24-.04.48-.07.64.21.35.39.74.52,1.16.28.81.41,1.67.33,2.45-.62-1.13-1.54-1.25-2.64-1.31-1.44-.09-2.9.49-3.29,2.06l-3.63,14.83-.91,3.87s-.01.03-.01.04c-.45,2.32-.9,4.65-1.35,6.97-.15.33-.62-.09-.69-.45-.06-.31-.11-.62-.16-.93l-.1.48c-.09-.15-.17-.31-.23-.46l-.24-1.86c.03-.36.1-.73.18-1.1-.07-.63-.12-1.26-.16-1.9l-.15.68c-.17-.53-.28-1.09-.37-1.69l-.24-1.86s0-.07-.01-.11l-.05-.38-2.85-22.53s0,0,0,0l-.09-.64-.3-2.36c1.57-2.53,1.89-7.29.58-12.4-.72-2.79-1.8-5.26-3.06-7.17l-1.35-10.72c.02-.17.05-.35.09-.52l2.09-5.33c7.38,12.65,12.93,26.19,18.06,39.63ZM122.41,124.84l7.12.21c.43.74.36,2.05-.4,2.79H42.14c-.74-.7-.93-1.81-.45-2.77l5.33-.17,6.4-.08h10.75l.03.03,2.37-.03h2.25s53.59.02,53.59.02ZM105.56,57.45l1.2,9.49c-1.61-1.85-3.39-2.78-4.98-2.38-3.33.85-4.58,7.21-2.8,14.2.76,2.99,1.95,5.62,3.33,7.57.36.52.74.99,1.13,1.41h-.01s0,.03.03.03h0c.7.77,1.44,1.36,2.18,1.74.88.45,1.75.6,2.57.39.49-.13.94-.38,1.34-.74l4.38,34.67h-57.03l4.36-34.55c.36.29.76.51,1.19.62.58.15,1.19.12,1.8-.08.91-.27,1.84-.9,2.72-1.8.15-.15.3-.31.44-.47.3-.34.6-.72.88-1.12,1.41-1.97,2.63-4.63,3.4-7.67,1.78-6.99.53-13.35-2.79-14.2-1.53-.39-3.23.46-4.79,2.17l1.16-9.15.02-.13-1.49-3.8c-.27-1.02-.55-2.04-.81-3.09-.08-.28.02-.76.18-1.05.82-.13,2.05-.32,3.55-.54,5-.66,12.7-1.53,18.71-1.57,6,.04,13.7.91,18.71,1.57,1.39.2,2.55.38,3.36.51.52.87-.28,2.97-.89,5.32l-1.05,2.66ZM75.19,34.56c3.18-2.72,7.81-5.03,11.89-4.35,6.15,1.02,12.69,7.86,16.08,12.93l3.43,5.14-4.48-.68-7.34-.82-.92-.02c-2.7-.23-5.44-.38-7.96-.38-.15,0-.3,0-.46,0-.15,0-.31,0-.46,0-2.47,0-5.17.15-7.83.37h-.62s-2.01.24-2.01.24c-2.92.3-5.66.65-7.84.96-1.01.13-1.92.26-2.68.37,3.27-5.28,6.51-9.76,11.19-13.76ZM43,95.93c.06-.58.13-1.14.3-1.65-.13-.05-.22-.12-.24-.23-.02-.11.01-.21.04-.31.15-.51.35-1.01.59-1.49,5.25-14.1,10.97-27.75,18.32-40.46l2.09,5.33c-.03,1.01-.09,2.01-.21,3-.08,1.12-.32,2.17-.47,3.28l-.59,4.99c-1.3,1.93-2.41,4.44-3.14,7.3-1.32,5.17-.98,10,.64,12.5h0s-.5,3.99-.5,3.99l-.68,5.48-.72,5.63-.74,5.77-.77,5.73-.13,2.13-.11.88c-.08-.07-.22-.18-.23-.18,0,.01-.05.06-.1.1-.07.66-.15,1.32-.22,1.98.07.84-.03,1.75-.28,2.66l-.02-.09c-.01.15-.03.31-.05.46-.22-.38-.42-.77-.59-1.16.11.57.15,1.11-.02,1.65l-1.21-5-.98-4.07s0-.04,0-.06l-3.14-13c-.41-1.71-.58-3.66-1.82-4.98-1.02-1.09-3.42-.8-4.4-.02l-.41.32c-.06.05-.25.05-.25-.03l.05-.45Z";
        const hatch = "M97.25,86.19c-.02-.67-.08-1.34-.14-1.9l-.7-6.31-.29-2.34-.96-8.92c-.22-2.1-1.99-3.68-4.1-3.68h-11.76c-2.1,0-3.86,1.57-4.1,3.65l-2.32,20.19c-.13,1.17.24,2.34,1.02,3.21.78.88,1.9,1.38,3.08,1.38h16.25c1.17,0,2.29-.5,3.07-1.37.78-.87,1.16-2.04,1.03-3.2l-.08-.72ZM73.87,86.99l2.32-20.19c.08-.67.37-1.27.8-1.74.24-.19.5-.42.77-.62.46-.26.98-.41,1.53-.41h11.76c1.6,0,2.94,1.2,3.11,2.79l2.17,20.19c.09.88-.19,1.76-.78,2.42-.42.47-.97.78-1.57.93-.21.04-.42.07-.63.07l-16.31-.03c-1.03,0-1.9-.46-2.51-1.15-.5-.64-.75-1.45-.65-2.27Z";
        const minX = 37.5, minY = 28.2, maxX = 133.3, maxY = 134.4;
        const sc = 168 / (maxY - minY);
        g.save();
        g.translate(96, 96);
        g.rotate(Math.PI / 2);
        g.scale(sc, sc);
        g.translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
        g.fillStyle = "#fff";
        g.fill(new Path2D(hull));
        g.fill(new Path2D(hatch));
        g.restore();
      });
      craftIcon.sputnik = sheet((g) => {
        g.beginPath();
        g.arc(68, 48, 12, 0, Math.PI * 2);
        g.moveTo(56, 48);
        g.ellipse(68, 48, 12, 3.6, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        // Two long whips, two short. They trail behind the direction of flight.
        g.moveTo(58, 40);
        g.lineTo(4, 8);
        g.moveTo(58, 56);
        g.lineTo(4, 88);
        g.moveTo(62, 44);
        g.lineTo(28, 30);
        g.moveTo(62, 52);
        g.lineTo(28, 66);
        g.stroke();
      });
      // Starship outline. Nose points +x. Aft flaps stay gapped off the hull.
      craftIcon.starship = sheetFine((g) => {
        g.lineWidth = 4.2;
        g.beginPath();
        g.moveTo(182, 96);
        g.lineTo(177.7, 91.9);
        g.lineTo(173.4, 88.5);
        g.lineTo(166.5, 85.6);
        g.lineTo(159.6, 77.4);
        g.lineTo(152.8, 69.3);
        g.lineTo(140.7, 68.2);
        g.lineTo(138.1, 80.3);
        g.lineTo(10, 80.3);
        g.lineTo(10, 111.7);
        g.lineTo(138.1, 111.7);
        g.lineTo(140.7, 123.8);
        g.lineTo(152.8, 122.7);
        g.lineTo(159.6, 114.6);
        g.lineTo(166.5, 106.4);
        g.lineTo(173.4, 103.5);
        g.lineTo(177.7, 100.1);
        g.closePath();
        g.moveTo(10, 67);
        g.lineTo(10, 75.4);
        g.lineTo(56.4, 75.4);
        g.lineTo(44.4, 69.3);
        g.lineTo(35.8, 67);
        g.closePath();
        g.moveTo(10, 125);
        g.lineTo(10, 116.6);
        g.lineTo(56.4, 116.6);
        g.lineTo(44.4, 122.7);
        g.lineTo(35.8, 125);
        g.closePath();
        g.stroke();
      });
    })();
    // Shell is orbit radius in Earth radii. True LEO is 1.06–1.12 and
    // GPS/GEO are 4.2 and 6.6, which fall outside the 7° sky. These keep
    // the altitude order and sit in the sky the full-Earth frame actually shows.
    const CRAFT = [
      { icon: "iss", inc: 51.6, shell: 1.26, period: 58, phase: 0.4, lon0: 18, size: 61 },
      { icon: "hubble", inc: 28.5, shell: 1.34, period: 62, phase: 1.7, lon0: 96, size: 26 },
      { icon: "tiangong", inc: 41.5, shell: 1.22, period: 56.5, phase: 2.5, lon0: 150, size: 28 },
      { icon: "landsat", inc: 98.2, shell: 1.46, period: 63.5, phase: 0.9, lon0: -30, size: 22 },
      { icon: "sentinel", inc: 98.6, shell: 1.52, period: 64.5, phase: 3.4, lon0: 12, size: 22 },
      { icon: "gps", inc: 55, shell: 2.15, period: 450, phase: 1.1, lon0: -110, size: 24 },
      { icon: "goes", inc: 0, shell: 2.75, period: 0, phase: 0, lon0: -75, size: 24 },
      { icon: "dragon", inc: 51.6, shell: 1.3, period: 60, phase: 0.28, lon0: -68, size: 20 },
      { icon: "sputnik", inc: 65, shell: 1.19, period: 54, phase: 1.05, lon0: 70, size: 34 },
      { icon: "starship", inc: 26.5, shell: 1.42, period: 63, phase: 3.8, lon0: -140, size: 53 },
    ];
    for (let s = 0; s < 8; s++) {
      CRAFT.push({
        icon: "starlink",
        inc: 53,
        shell: 1.36,
        period: 59,
        phase: 4.2,
        slot: s - 3.5,
        lon0: -20,
        size: 16,
      });
    }
    function craftVector(t, craft, extra) {
      const u = craft.period > 0 ? (t / craft.period) * Math.PI * 2 + craft.phase + (extra || 0) : craft.phase;
      const inc = (craft.inc * Math.PI) / 180;
      const raan = (craft.lon0 * Math.PI) / 180;
      const ox = Math.cos(u);
      const oy = Math.sin(u) * Math.cos(inc);
      const oz = Math.sin(u) * Math.sin(inc);
      const c = Math.cos(raan);
      const s = Math.sin(raan);
      return [ox * c - oy * s, ox * s + oy * c, oz];
    }
    function drawCraft(now, view) {
      if (!motionOn) return;
      const earthR = view.earthR;
      const fade = view.fade;
      const fr = view.fr;
      const oy = view.oy;
      const oz = view.oz;
      const W = view.W;
      const H = view.H;
      const focal = view.focal;
      const R = view.R;
      if (!(earthR > 8) || !(fade > 0) || !(R > 1)) return;
      const t = now / 1000;
      const cd = Math.hypot(oy, oz) || 1;
      const camDir = [
        (-oy * fr.Y[0] - oz * fr.Z[0]) / cd,
        (-oy * fr.Y[1] - oz * fr.Z[1]) / cd,
        (-oy * fr.Y[2] - oz * fr.Z[2]) / cd,
      ];
      function starExtra(at, craft) {
        if (craft.slot == null) return 0;
        const base = craftVector(at, craft, 0);
        const facing = base[0] * camDir[0] + base[1] * camDir[1] + base[2] * camDir[2];
        const open = Math.max(0, Math.min(1, facing));
        const widen = open * open * (3 - 2 * open);
        return craft.slot * (0.04 + 0.16 * widen);
      }
      const list = [];
      for (let i = 0; i < CRAFT.length; i++) {
        const craft = CRAFT[i];
        const extra = starExtra(t, craft);
        const dir = craftVector(t, craft, extra);
        const rad = R * craft.shell;
        const vx = dir[0] * rad;
        const vy = dir[1] * rad;
        const vz = dir[2] * rad;
        const camX = vx * fr.X[0] + vy * fr.X[1] + vz * fr.X[2];
        const camY = vx * fr.Y[0] + vy * fr.Y[1] + vz * fr.Y[2] + oy;
        const camZ = vx * fr.Z[0] + vy * fr.Z[1] + vz * fr.Z[2] + oz;
        if (camZ < 8) continue;
        const aheadT = t + Math.max(1.5, (craft.period || 40) * 0.02);
        const ahead = craftVector(aheadT, craft, starExtra(aheadT, craft));
        const ax = (ahead[0] * rad) * fr.X[0] + (ahead[1] * rad) * fr.X[1] + (ahead[2] * rad) * fr.X[2];
        const ay = (ahead[0] * rad) * fr.Y[0] + (ahead[1] * rad) * fr.Y[1] + (ahead[2] * rad) * fr.Y[2] + oy;
        const az = (ahead[0] * rad) * fr.Z[0] + (ahead[1] * rad) * fr.Z[1] + (ahead[2] * rad) * fr.Z[2] + oz;
        if (az < 8) continue;
        const dd = camX * camX + camY * camY + camZ * camZ;
        const de = camY * oy + camZ * oz;
        const ee = oy * oy + oz * oz;
        const disc = 4 * de * de - 4 * dd * (ee - R * R);
        let tNear = 2;
        if (disc >= 0) {
          const sd = Math.sqrt(disc);
          tNear = (2 * de - sd) / (2 * dd);
          if (tNear > 0.02 && tNear < 0.985) continue;
        }
        // Far limb only. The fade starts a little before the craft reaches it,
        // and it comes back a little before it has cleared the limb.
        const cross = Math.hypot(oy * camZ - oz * camY, oz * camX, -oy * camX);
        const along = cross / (Math.sqrt(dd) * R);
        let limbA = 1;
        if (camZ > oz && along > 0.99 && along < 1.078) {
          const u = (1.078 - along) / 0.088;
          limbA = Math.exp(-Math.pow(u, 2.2) * 4.2);
        }
        if (limbA < 0.03) continue;
        const x = W / 2 + (camX / camZ) * focal;
        const y = H / 2 - (camY / camZ) * focal;
        const nx = W / 2 + (ax / az) * focal;
        const ny = H / 2 - (ay / az) * focal;
        list.push({
          x: x,
          y: y,
          z: camZ,
          icon: craft.icon,
          limbA: limbA,
          size: craft.size * Math.max(0.55, Math.min(1.45, oz / camZ)) * Math.max(0.55, Math.min(1.2, earthR / 380)),
          ang: Math.atan2(ny - y, nx - x),
        });
      }
      list.sort((a, b) => b.z - a.z);
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        const icon = craftIcon[it.icon];
        if (!icon) continue;
        if (it.x < -40 || it.y < -40 || it.x > W + 40 || it.y > H + 40) continue;
        ctx.save();
        ctx.globalAlpha = fade * it.limbA;
        ctx.translate(it.x, it.y);
        ctx.rotate(it.ang);
        ctx.drawImage(icon, -it.size / 2, -it.size / 2, it.size, it.size);
        ctx.restore();
      }
      ctx.restore();
    }

    // Major city pairs. An arc draws on in the direction of flight, then
    // draws off the same way. A lane always finishes, even if interaction
    // starts or the route slips behind the Earth.
    const PORTS = [
      [51.47, -0.45], [40.64, -73.78], [33.94, -118.41], [37.62, -122.38],
      [41.98, -87.9], [25.8, -80.29], [49.01, 2.55], [50.04, 8.57],
      [52.31, 4.76], [40.47, -3.56], [38.77, -9.14], [41.28, 28.74],
      [25.25, 55.36], [25.27, 51.61], [1.36, 103.99], [22.31, 113.91],
      [35.76, 140.39], [37.46, 126.44], [31.14, 121.81], [40.08, 116.6],
      [13.69, 100.75], [28.56, 77.1], [19.09, 72.87], [-33.95, 151.18],
      [-37.67, 144.84], [-31.94, 115.97], [-37.01, 174.79], [-23.43, -46.47],
      [-34.82, -58.54], [-33.39, -70.79], [-12.02, -77.11], [19.44, -99.07],
      [4.7, -74.15], [-26.14, 28.25], [43.68, -79.63], [49.19, -123.18],
      [41.8, 12.25], [-22.81, -43.25], [21.32, -157.92], [47.45, -122.31],
      [38.95, -77.46], [42.37, -71.01], [-1.32, 36.93], [33.37, -7.59],
      [-15.87, -47.92], [-19.85, -43.95], [-25.43, -49.27], [-29.99, -51.17],
      [-12.91, -38.33], [-8.13, -34.92], [-3.78, -38.53], [-3.04, -60.05],
      [-1.38, -48.48], [-27.67, -48.55],
      [6.58, 3.32], [5.6, -0.19], [30.12, 31.41], [9.0, 38.76],
      [-33.97, 18.6], [-29.86, 31.03], [36.85, 10.23], [36.69, 3.22],
      [14.74, -17.49], [-6.88, 39.2], [-1.94, 30.06], [-25.97, 32.57],
      [5.25, -3.93], [15.59, 32.55],
      [-27.38, 153.12], [-34.95, 138.53], [-35.28, 149.13],
    ];
    const PORT = PORTS.map(function (p) {
      const lat = (p[0] * Math.PI) / 180;
      const lon = (p[1] * Math.PI) / 180;
      const c = Math.cos(lat);
      return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)];
    });
    const ROUTES = [
      [0, 1], [0, 2], [0, 14], [0, 15], [0, 12], [0, 33], [0, 21], [0, 16],
      [0, 27], [0, 4], [0, 40], [0, 41], [0, 3], [0, 13], [0, 25],
      [6, 1], [6, 16], [6, 2], [6, 27],
      [7, 14], [7, 1], [7, 27], [7, 16],
      [8, 1], [8, 27],
      [12, 14], [12, 23], [12, 27], [12, 1], [12, 24],
      [13, 23], [13, 27],
      [14, 23], [14, 16], [14, 26], [14, 1],
      [15, 23], [15, 1], [15, 2],
      [16, 2], [16, 3], [16, 23], [16, 1],
      [17, 2], [17, 1],
      [19, 0], [18, 2], [18, 0],
      [21, 1], [22, 0], [22, 12],
      [23, 2], [24, 14], [26, 13],
      [27, 10], [27, 5], [27, 1], [27, 28], [27, 9], [27, 36],
      [9, 28], [9, 31], [9, 32], [9, 30], [9, 29],
      [31, 1], [31, 2],
      [33, 12], [34, 0], [35, 15],
      [11, 1], [11, 14],
      [20, 0], [20, 16],
      [36, 1], [10, 1], [10, 28],
      [38, 16], [39, 0], [37, 10],
      [42, 0], [43, 6],
      [4, 16], [5, 12], [40, 7], [41, 6],
      [28, 29], [27, 30], [27, 31], [23, 26],
      [37, 1], [27, 2], [44, 40], [48, 5], [37, 4],
      [54, 12], [42, 22], [56, 13], [57, 21], [33, 21],
      [16, 39], [17, 35], [19, 39],
    ];
    // Regional hops: capitals and neighbors. Three times as many, and much higher.
    const SHORT_AT = ROUTES.length;
    ROUTES.push(
      [0, 6], [0, 8], [0, 7], [6, 7], [6, 8], [6, 36], [7, 8], [7, 36],
      [9, 10], [9, 6], [10, 6], [1, 41], [1, 40], [1, 4], [1, 34],
      [2, 3], [3, 39], [27, 37], [12, 13], [14, 20], [16, 17],
      [18, 19], [18, 15], [23, 24], [21, 22], [43, 10], [43, 9],
      [34, 40], [5, 1], [8, 36],
      [27, 44], [27, 45], [27, 46], [27, 47], [27, 53],
      [37, 44], [37, 45], [37, 46], [37, 48], [37, 53],
      [44, 45], [44, 48], [44, 51], [44, 52], [45, 46], [45, 48],
      [46, 47], [46, 53], [47, 53],
      [48, 49], [49, 50], [50, 52], [51, 52],
      [54, 55], [54, 66], [55, 66], [62, 66],
      [43, 61], [60, 61],
      [33, 58], [33, 59], [33, 65], [58, 59], [59, 65],
      [42, 57], [42, 63], [42, 64], [57, 63], [57, 67], [63, 64], [56, 67],
      [23, 68], [23, 69], [23, 70], [24, 68], [24, 69], [24, 70],
      [25, 69], [68, 70], [69, 70]
    );
    const lanes = [];
    const laneOn = [];
    const splashes = [];
    let routeClock = 0;
    let routeStamp = 0;
    let nextShort = 0.35;
    let nextLong = 1.2;
    let burstQ = [];
    let burstAt = 6;
    let burstKind = 0;
    // Last 13 long routes: 5 Brazil–US, 5 Africa–Asia/India/Arabia, 3 North Pacific.
    const BURST_GROUPS = [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
      [10, 11, 12],
    ].map(function (g) {
      const base = SHORT_AT - 13;
      return g.map(function (k) { return base + k; });
    });
    function arcMix(a, b, s, omega, sinO) {
      const t1 = Math.sin((1 - s) * omega) / sinO;
      const t2 = Math.sin(s * omega) / sinO;
      const x = a[0] * t1 + b[0] * t2;
      const y = a[1] * t1 + b[1] * t2;
      const z = a[2] * t1 + b[2] * t2;
      const n = Math.hypot(x, y, z) || 1;
      return [x / n, y / n, z / n];
    }
    function easeInOut(t) {
      const x = t < 0 ? 0 : t > 1 ? 1 : t;
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }
    function drawRoutes(now, view) {
      if (!motionOn) return;
      const fade = view.fade;
      const fr = view.fr;
      const oy = view.oy;
      const oz = view.oz;
      const W = view.W;
      const H = view.H;
      const focal = view.focal;
      const R = view.R;
      if (!(fade > 0) || !(R > 1)) return;
      if (!routeStamp) routeStamp = now;
      const dt = Math.min(0.05, Math.max(0, (now - routeStamp) / 1000));
      routeStamp = now;
      routeClock += dt;
      const cd = Math.hypot(oy, oz) || 1;
      const camDir = [
        (-oy * fr.Y[0] - oz * fr.Z[0]) / cd,
        (-oy * fr.Y[1] - oz * fr.Z[1]) / cd,
        (-oy * fr.Y[2] - oz * fr.Z[2]) / cd,
      ];
      function facing(v) {
        return v[0] * camDir[0] + v[1] * camDir[1] + v[2] * camDir[2];
      }
      let shortLive = 0;
      let longLive = 0;
      for (let n = 0; n < lanes.length; n++) {
        if (lanes[n].i >= SHORT_AT) shortLive++;
        else longLive++;
      }
      function routeFaces(i, strict) {
        const pair = ROUTES[i];
        if (!pair) return false;
        const a = PORT[pair[0]];
        const b = PORT[pair[1]];
        const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
        const omega = Math.acos(c);
        if (!(omega > 0.035) || omega > 3) return false;
        const sinO = Math.sin(omega);
        let front = 0;
        let back = 0;
        for (let k = 0; k <= 4; k++) {
          const f = facing(arcMix(a, b, k / 4, omega, sinO));
          if (f > 0.08) front++;
          else if (f < -0.05) back++;
        }
        if (!strict) return front >= 2;
        return front >= 2 || (front >= 1 && back >= 1);
      }
      function pushLane(picked, hop) {
        if (picked < 0 || laneOn[picked]) return false;
        const pair = ROUTES[picked];
        const swap = Math.random() < 0.5;
        const a = PORT[swap ? pair[1] : pair[0]];
        const b = PORT[swap ? pair[0] : pair[1]];
        const c = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
        const omega = Math.acos(c);
        if (!(omega > 0.035) || omega > 3) return false;
        laneOn[picked] = true;
        lanes.push({
          i: picked,
          a: a,
          b: b,
          omega: omega,
          sinO: Math.sin(omega),
          peak: hop
            ? 0.11 * (0.8 + Math.random() * 0.4)
            : Math.max(0.032, Math.min(0.085, 0.02 + omega * 0.04)),
          born: routeClock,
          dur: 5.2 + omega * 0.9 + Math.random() * 1.5,
        });
        return true;
      }
      function spawn(hop) {
        const span = ROUTES.length - SHORT_AT;
        for (let tries = 0; tries < 16; tries++) {
          const i = hop
            ? SHORT_AT + ((Math.random() * span) | 0)
            : (Math.random() * SHORT_AT) | 0;
          if (laneOn[i] || !routeFaces(i, true)) continue;
          if (pushLane(i, hop)) return;
        }
      }
      const shortCap = globeIdle ? 9 : 4;
      const longCap = globeIdle ? 2 : 1;
      if (shortLive < shortCap && routeClock >= nextShort) {
        spawn(true);
        nextShort = routeClock + (globeIdle ? 0.55 + Math.random() * 0.85 : 1.7 + Math.random() * 1.8);
      }
      if (longLive < longCap && routeClock >= nextLong) {
        spawn(false);
        nextLong = routeClock + (globeIdle ? 4.2 + Math.random() * 4.4 : 6 + Math.random() * 6);
      }
      if (routeClock >= burstAt) {
        if (!burstQ.length) {
          burstQ = BURST_GROUPS[burstKind % BURST_GROUPS.length].slice();
          burstKind++;
        }
        const bi = burstQ[0];
        if (laneOn[bi]) {
          burstQ.shift();
          burstAt = routeClock + 0.4;
        } else if (!routeFaces(bi, false)) {
          burstAt = routeClock + 1.4;
        } else if (pushLane(bi, false)) {
          burstQ.shift();
          burstAt = routeClock + (burstQ.length ? 1.25 : 14 + Math.random() * 10);
        } else {
          burstQ.shift();
          burstAt = routeClock + 1.4;
        }
      }
      const ee = oy * oy + oz * oz;
      function hidden(x, y, z) {
        const camX = x * fr.X[0] + y * fr.X[1] + z * fr.X[2];
        const camY = x * fr.Y[0] + y * fr.Y[1] + z * fr.Y[2] + oy;
        const camZ = x * fr.Z[0] + y * fr.Z[1] + z * fr.Z[2] + oz;
        if (camZ < 8) return { hide: true };
        const dd = camX * camX + camY * camY + camZ * camZ;
        const de = camY * oy + camZ * oz;
        const disc = 4 * de * de - 4 * dd * (ee - R * R);
        if (disc > 0) {
          const tNear = (2 * de - Math.sqrt(disc)) / (2 * dd);
          if (tNear > 0.02 && tNear < 0.985) return { hide: true };
        }
        return {
          hide: false,
          x: W / 2 + (camX / camZ) * focal,
          y: H / 2 - (camY / camZ) * focal,
        };
      }
      function vdot(u, v) {
        return u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      }
      function vcross(u, v) {
        return [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ];
      }
      function vnorm(u) {
        const n = Math.hypot(u[0], u[1], u[2]) || 1;
        return [u[0] / n, u[1] / n, u[2] / n];
      }
      function frameOf(p) {
        const x = -p[0] * p[2];
        const y = -p[1] * p[2];
        const z = p[0] * p[0] + p[1] * p[1];
        const nl = Math.hypot(x, y, z);
        const north = nl < 1e-5 ? [0, 1, 0] : [x / nl, y / nl, z / nl];
        const raw = vcross(north, p);
        const el = Math.hypot(raw[0], raw[1], raw[2]) || 1;
        return {
          east: [raw[0] / el, raw[1] / el, raw[2] / el],
          north: north,
        };
      }
      function travelDir(city, other, atEnd) {
        const c = vdot(city, other);
        return vnorm(atEnd
          ? [c * city[0] - other[0], c * city[1] - other[1], c * city[2] - other[2]]
          : [other[0] - c * city[0], other[1] - c * city[1], other[2] - c * city[2]]);
      }
      // One turn, counterclockwise when seen from above the city.
      // The outer end is rotated so it leaves (or arrives) along the route.
      function spiralDelta(city, forward, tau, grow, rMax) {
        const fr = frameOf(city);
        const bearing = Math.atan2(vdot(forward, fr.north), vdot(forward, fr.east));
        const theta = tau * Math.PI * 2;
        const coef = grow ? tau : 1 - tau;
        const dCoef = grow ? 1 / (2 * Math.PI) : -1 / (2 * Math.PI);
        const velAngle = Math.atan2(1, dCoef);
        const psi = bearing - velAngle;
        const px = coef * Math.cos(theta);
        const py = coef * Math.sin(theta);
        const cp = Math.cos(psi);
        const sp = Math.sin(psi);
        const xr = (px * cp - py * sp) * rMax;
        const yr = (px * sp + py * cp) * rMax;
        return [
          xr * fr.east[0] + yr * fr.north[0],
          xr * fr.east[1] + yr * fr.north[1],
          xr * fr.east[2] + yr * fr.north[2],
        ];
      }
      function smooth01(t) {
        const x = t < 0 ? 0 : t > 1 ? 1 : t;
        return x * x * (3 - 2 * x);
      }
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const lw = Math.max(1.15, Math.min(2.05, view.earthR / 260));
      const slash = Math.max(W, H) * 0.5;
      for (let n = lanes.length - 1; n >= 0; n--) {
        const lane = lanes[n];
        const p = (routeClock - lane.born) / lane.dur;
        if (p >= 2) {
          laneOn[lane.i] = false;
          lanes.splice(n, 1);
          continue;
        }
        if (!lane.left) {
          lane.left = true;
          splashes.push({ dir: lane.a, born: routeClock, dur: 1.05 });
        }
        if (!lane.hit && p >= 1) {
          lane.hit = true;
          splashes.push({ dir: lane.b, born: routeClock, dur: 1.05 });
        }
        if (splashes.length > 12) splashes.splice(0, splashes.length - 12);
        const along = p < 1 ? easeInOut(p) : easeInOut(p - 1);
        const s0 = p < 1 ? 0 : along;
        const s1 = p < 1 ? along : 1;
        if (s1 - s0 < 0.004) continue;
        const spin = 0.12;
        const screenR = Math.max(80, view.earthR || 400);
        const rMax = Math.max(0.012, Math.min(0.05, Math.min(lane.omega * 0.3, 26 / screenR)));
        const blend = Math.max(0.08, Math.min(0.36, (rMax / Math.max(0.05, lane.omega)) * 1.85));
        const join = 0.045;
        const depFwd = travelDir(lane.a, lane.b, false);
        const arrFwd = travelDir(lane.b, lane.a, true);
        // Half the route height is the helix, along local up. The turn stays in the tangent plane.
        const climb = lane.peak * 0.5;
        function worldOf(dir, alt, delta) {
          return [
            dir[0] * alt + delta[0] * R,
            dir[1] * alt + delta[1] * R,
            dir[2] * alt + delta[2] * R,
          ];
        }
        function spiralWorld(city, fwd, tau, grow) {
          const h = grow ? climb * tau : climb * (1 - tau);
          return worldOf(city, R * (1 + h), spiralDelta(city, fwd, tau, grow, rMax));
        }
        function arcWorld(g) {
          const dir = arcMix(lane.a, lane.b, g, lane.omega, lane.sinO);
          const alt = R * (1 + climb + (lane.peak - climb) * Math.sin(Math.PI * g));
          let w = 0;
          let hook = null;
          if (g < blend) {
            w = 1 - smooth01(g / blend);
            hook = spiralDelta(lane.a, depFwd, 1, true, rMax);
          } else if (g > 1 - blend) {
            w = smooth01((g - (1 - blend)) / blend);
            hook = spiralDelta(lane.b, arrFwd, 0, false, rMax);
          }
          const delta = hook ? [hook[0] * w, hook[1] * w, hook[2] * w] : [0, 0, 0];
          return worldOf(dir, alt, delta);
        }
        function mixWorld(a, b, u) {
          const w = smooth01(u);
          return [
            a[0] + (b[0] - a[0]) * w,
            a[1] + (b[1] - a[1]) * w,
            a[2] + (b[2] - a[2]) * w,
          ];
        }
        function at(s) {
          let p;
          if (s < spin - join) {
            p = spiralWorld(lane.a, depFwd, s / spin, true);
          } else if (s < spin + join) {
            const u = (s - (spin - join)) / (2 * join);
            const g = Math.max(0, (s - spin) / (1 - 2 * spin));
            p = mixWorld(
              spiralWorld(lane.a, depFwd, Math.min(1, s / spin), true),
              arcWorld(g),
              u
            );
          } else if (s > 1 - (spin - join)) {
            p = spiralWorld(lane.b, arrFwd, (s - (1 - spin)) / spin, false);
          } else if (s > 1 - (spin + join)) {
            const u = (s - (1 - spin - join)) / (2 * join);
            const g = Math.min(1, (s - spin) / (1 - 2 * spin));
            p = mixWorld(
              arcWorld(g),
              spiralWorld(lane.b, arrFwd, Math.max(0, (s - (1 - spin)) / spin), false),
              u
            );
          } else {
            p = arcWorld((s - spin) / (1 - 2 * spin));
          }
          return hidden(p[0], p[1], p[2]);
        }
        function mark(q, s) {
          if (q.hide) return q;
          // Same tail ramp on the way in and the way out, so arrival does not pop.
          const u = (s - s0) / Math.max(0.001, s1 - s0);
          const t = Math.max(0, Math.min(1, u / 0.7));
          q.a = t * t * (3 - 2 * t);
          return q;
        }
        function edge(sVis, sHid) {
          let lo = sVis;
          let hi = sHid;
          for (let it = 0; it < 8; it++) {
            const mid = (lo + hi) * 0.5;
            if (at(mid).hide) hi = mid;
            else lo = mid;
          }
          return mark(at(lo), lo);
        }
        function stroke(pts) {
          if (pts.length < 2) return;
          ctx.lineCap = "butt";
          for (let k = 1; k < pts.length; k++) {
            const p0 = pts[k - 1];
            const p1 = pts[k];
            if (p0.a < 0.02 && p1.a < 0.02) continue;
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.4) continue;
            const shade = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
            shade.addColorStop(0, "rgba(0,0,0," + (0.45 * p0.a).toFixed(3) + ")");
            shade.addColorStop(1, "rgba(0,0,0," + (0.45 * p1.a).toFixed(3) + ")");
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineWidth = lw + 1.8;
            ctx.strokeStyle = shade;
            ctx.globalAlpha = fade;
            ctx.stroke();
            const core = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
            core.addColorStop(0, "rgba(255,255,255," + (0.9 * p0.a).toFixed(3) + ")");
            core.addColorStop(1, "rgba(255,255,255," + (0.9 * p1.a).toFixed(3) + ")");
            ctx.lineWidth = lw;
            ctx.strokeStyle = core;
            ctx.globalAlpha = fade * 0.86;
            ctx.stroke();
          }
          ctx.lineCap = "round";
        }
        let run = [];
        let prev = null;
        let prevS = s0;
        const samples = [];
        function pushSpan(a, b, nFull, full) {
          const span = b - a;
          if (span <= 0.0001) return;
          const n = Math.max(2, Math.round((nFull * span) / full));
          for (let i = 0; i <= n; i++) {
            const s = a + (span * i) / n;
            if (!samples.length || s > samples[samples.length - 1] + 0.00001) samples.push(s);
          }
        }
        if (s0 < spin) pushSpan(s0, Math.min(s1, spin), 26, spin);
        if (s1 > spin && s0 < 1 - spin) pushSpan(Math.max(s0, spin), Math.min(s1, 1 - spin), 36, 1 - 2 * spin);
        if (s1 > 1 - spin) pushSpan(Math.max(s0, 1 - spin), s1, 26, spin);
        for (let k = 0; k < samples.length; k++) {
          const s = samples[k];
          const q = mark(at(s), s);
          if (prev && prev.hide !== q.hide) {
            const edgeQ = edge(prev.hide ? s : prevS, prev.hide ? prevS : s);
            if (!edgeQ.hide) {
              if (prev.hide) run = [edgeQ];
              else {
                run.push(edgeQ);
                stroke(run);
                run = [];
              }
            }
          }
          if (!q.hide) {
            if (run.length) {
              const last = run[run.length - 1];
              if (Math.hypot(q.x - last.x, q.y - last.y) > slash) {
                stroke(run);
                run = [];
              }
            }
            run.push(q);
          }
          prev = q;
          prevS = s;
        }
        stroke(run);
        if (p < 1 && s1 - s0 > 0.02) {
          const tip = at(s1);
          if (!tip.hide) {
            const r = Math.max(2.2, lw * 1.65);
            const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, r);
            glow.addColorStop(0, "rgba(255,255,255,0.9)");
            glow.addColorStop(0.42, "rgba(255,255,255,0.2)");
            glow.addColorStop(1, "rgba(255,255,255,0)");
            ctx.beginPath();
            ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.globalAlpha = fade;
            ctx.fill();
          }
        }
      }
      function onSurface(dir, rho, steps) {
        const fr = frameOf(dir);
        const lift = R * 1.006;
        const out = [];
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const c = Math.cos(a) * rho;
          const sn = Math.sin(a) * rho;
          const x = dir[0] + fr.east[0] * c + fr.north[0] * sn;
          const y = dir[1] + fr.east[1] * c + fr.north[1] * sn;
          const z = dir[2] + fr.east[2] * c + fr.north[2] * sn;
          const n = Math.hypot(x, y, z) || 1;
          out.push(hidden((x / n) * lift, (y / n) * lift, (z / n) * lift));
        }
        return out;
      }
      function paintSurface(samples) {
        let pen = false;
        let prev = null;
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const q = samples[i];
          const jump = prev && !prev.hide && !q.hide && Math.hypot(q.x - prev.x, q.y - prev.y) > slash;
          if (q.hide || jump) {
            pen = false;
            prev = q;
            continue;
          }
          if (!pen) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
          pen = true;
          prev = q;
        }
        return pen;
      }
      for (let s = splashes.length - 1; s >= 0; s--) {
        const sp = splashes[s];
        const age = (routeClock - sp.born) / sp.dur;
        if (age >= 1) {
          splashes.splice(s, 1);
          continue;
        }
        const q = hidden(sp.dir[0] * R, sp.dir[1] * R, sp.dir[2] * R);
        if (q.hide) continue;
        const reach = Math.max(10, Math.min(22, view.earthR * 0.03));
        const grow = 1 - Math.pow(1 - age, 2);
        const drop = Math.pow(1 - age, 0.7);
        const px = Math.max(80, view.earthR);
        const ring = onSurface(sp.dir, (1.2 + grow * reach) / px, 32);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = Math.max(1.15, 1.85 * Math.pow(1 - age, 0.55));
        ctx.globalAlpha = fade * drop * 0.82;
        if (paintSurface(ring)) ctx.stroke();
        if (age < 0.42) {
          const flash = 1 - age / 0.42;
          const core = onSurface(sp.dir, 4.6 / px, 16);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.globalAlpha = fade * flash * 0.72;
          if (paintSurface(core)) ctx.fill();
        }
      }
      ctx.restore();
    }

    // Occasional saucer. Crosses in front of the disk, parks on the upper-right
    // limb, sweeps a cone across the surface, whips around once, and leaves.
    const ufoIcon = (function () {
      const c = document.createElement("canvas");
      c.width = c.height = 180;
      const g = c.getContext("2d");
      g.strokeStyle = "#fff";
      g.lineWidth = 7;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      g.ellipse(90, 102, 74, 18, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      g.moveTo(58, 96);
      g.quadraticCurveTo(90, 46, 122, 96);
      g.quadraticCurveTo(90, 108, 58, 96);
      g.closePath();
      g.fill();
      g.globalCompositeOperation = "source-over";
      g.beginPath();
      g.moveTo(58, 96);
      g.quadraticCurveTo(90, 46, 122, 96);
      g.quadraticCurveTo(90, 108, 58, 96);
      g.stroke();
      g.beginPath();
      g.moveTo(90, 71);
      g.lineTo(90, 56);
      g.moveTo(83, 56);
      g.lineTo(97, 56);
      g.stroke();
      g.beginPath();
      g.ellipse(90, 112, 42, 13, 0, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
      return c;
    })();
    let ufoPhase = "wait";
    let ufoClock = 0;
    let ufoStamp = 0;
    let ufoPhaseAt = 0;
    let ufoNext = 11;
    let ufoVisit = null;
    let ufoTrail = [];
    function drawUfo(now, view) {
      const fade = view.fade;
      const earthR = view.earthR;
      const earthX = view.earthX;
      const earthY = view.earthY;
      const W = view.W;
      const H = view.H;
      const disk = (earthR * 2) / Math.max(1, H);
      const size = Math.max(45, Math.min(85, earthR * 0.1125));
      function edgePoint(side, t) {
        const u = Math.max(0.08, Math.min(0.92, t));
        const m = size + 24;
        if (side === 0) return { x: -m, y: u * H };
        if (side === 1) return { x: W + m, y: u * H };
        if (side === 2) return { x: u * W, y: -m };
        return { x: u * W, y: H + m };
      }
      function rollVisit() {
        let parkAx = 0.85;
        let parkAy = -0.4;
        for (let i = 0; i < 12; i++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 0.58 + Math.random() * 0.5;
          const ax = Math.cos(ang) * dist;
          const ay = Math.sin(ang) * dist;
          const x = earthX + ax * earthR;
          const y = earthY + ay * earthR;
          if (x > 48 && y > 48 && x < W - 48 && y < H - 48) {
            parkAx = ax;
            parkAy = ay;
            break;
          }
        }
        const corners = Math.random() < 0.64 ? 1 + ((Math.random() * 2) | 0) : 0;
        const jinks = [];
        for (let i = 1; i <= corners; i++) {
          jinks.push({
            t: i / (corners + 1),
            kick: (Math.random() < 0.5 ? -1 : 1) * (0.32 + Math.random() * 0.5),
          });
        }
        return {
          side: (Math.random() * 4) | 0,
          sideT: Math.random(),
          parkAx: parkAx,
          parkAy: parkAy,
          jinks: jinks,
          scan: Math.random() < 0.55,
          spin: Math.random() < 0.42,
          outSide: (Math.random() * 4) | 0,
          outT: Math.random(),
          outKick: Math.random() < 0.45 ? (Math.random() < 0.5 ? -1 : 1) * (0.28 + Math.random() * 0.4) : 0,
          inDur: corners ? 1.55 + corners * 0.55 : 3.3 + Math.random() * 1.5,
          outDur: 0.8 + Math.random() * 0.5,
        };
      }
      function bend(a, b, marks) {
        const pts = [a];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        for (let i = 0; i < marks.length; i++) {
          const mk = marks[i];
          pts.push({
            x: a.x + dx * mk.t + nx * mk.kick * earthR,
            y: a.y + dy * mk.t + ny * mk.kick * earthR,
          });
        }
        pts.push(b);
        return pts;
      }
      function walk(pts, t) {
        const lens = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
          lens.push(L);
          total += L;
        }
        let dist = Math.max(0, Math.min(1, t)) * total;
        for (let i = 0; i < lens.length; i++) {
          if (dist <= lens[i] || i === lens.length - 1) {
            const u = lens[i] > 0.001 ? Math.max(0, Math.min(1, dist / lens[i])) : 1;
            return {
              x: pts[i].x + (pts[i + 1].x - pts[i].x) * u,
              y: pts[i].y + (pts[i + 1].y - pts[i].y) * u,
            };
          }
          dist -= lens[i];
        }
        return pts[pts.length - 1];
      }
      const visiting = ufoPhase !== "wait" && ufoVisit;
      const park = visiting ? {
        x: earthX + ufoVisit.parkAx * earthR,
        y: earthY + ufoVisit.parkAy * earthR,
      } : null;
      const globeOk = motionOn && fade > 0.55 && disk > 0.42 && disk < 1.45;
      const parkOk = !visiting || (park.x > 24 && park.y > 24 && park.x < W - 24 && park.y < H - 24);
      if (!globeOk || !parkOk) {
        ufoStamp = 0;
        ufoTrail = [];
        return;
      }
      if (!ufoStamp) ufoStamp = now;
      const dt = Math.min(0.05, Math.max(0, (now - ufoStamp) / 1000));
      ufoStamp = now;
      ufoClock += dt;
      const age = ufoClock - ufoPhaseAt;
      const SCAN = 2.4;
      const SPIN = 0.62;
      if (ufoPhase === "wait" && age >= ufoNext) {
        ufoVisit = rollVisit();
        ufoPhase = "in";
        ufoPhaseAt = ufoClock;
      } else if (ufoPhase === "in" && age >= ufoVisit.inDur) {
        ufoPhase = ufoVisit.scan ? "scan" : ufoVisit.spin ? "spin" : "out";
        ufoPhaseAt = ufoClock;
      } else if (ufoPhase === "scan" && age >= SCAN) {
        ufoPhase = ufoVisit.spin ? "spin" : "out";
        ufoPhaseAt = ufoClock;
      } else if (ufoPhase === "spin" && age >= SPIN) {
        ufoPhase = "out";
        ufoPhaseAt = ufoClock;
      } else if (ufoPhase === "out" && age >= ufoVisit.outDur) {
        ufoPhase = "wait";
        ufoPhaseAt = ufoClock;
        ufoVisit = null;
        ufoNext = 22 + Math.random() * 26;
      }
      const showCraft = ufoPhase !== "wait" && ufoVisit;
      let pos = null;
      let live = 0;
      if (showCraft) {
      live = ufoClock - ufoPhaseAt;
      const here = {
        x: earthX + ufoVisit.parkAx * earthR,
        y: earthY + ufoVisit.parkAy * earthR,
      };
      const loopR = Math.max(16, size * 0.62);
      pos = here;
      if (ufoPhase === "in") {
        const start = edgePoint(ufoVisit.side, ufoVisit.sideT);
        if (ufoVisit.jinks.length) {
          pos = walk(bend(start, here, ufoVisit.jinks), Math.min(1, live / ufoVisit.inDur));
        } else {
          const t = easeInOut(live / ufoVisit.inDur);
          const u = 1 - t;
          const ctrl = {
            x: (start.x + here.x) * 0.5 + (earthX - (start.x + here.x) * 0.5) * 0.45,
            y: (start.y + here.y) * 0.5 + (earthY - (start.y + here.y) * 0.5) * 0.45,
          };
          pos = {
            x: u * u * start.x + 2 * u * t * ctrl.x + t * t * here.x,
            y: u * u * start.y + 2 * u * t * ctrl.y + t * t * here.y,
          };
        }
      } else if (ufoPhase === "spin") {
        const e = Math.min(1, live / SPIN);
        const ang = e * e * Math.PI * 2;
        pos = {
          x: here.x + Math.sin(ang) * loopR,
          y: here.y - (1 - Math.cos(ang)) * loopR * 0.2,
        };
      } else if (ufoPhase === "out") {
        const exit = edgePoint(ufoVisit.outSide, ufoVisit.outT);
        const marks = ufoVisit.outKick ? [{ t: 0.42, kick: ufoVisit.outKick }] : [];
        const e = Math.min(1, live / ufoVisit.outDur);
        pos = walk(bend(here, exit, marks), e * e);
        const last = ufoTrail[ufoTrail.length - 1];
        if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) >= 5) {
          ufoTrail.push({ x: pos.x, y: pos.y, t: ufoClock });
          if (ufoTrail.length > 24) ufoTrail.shift();
        }
      }
      if (ufoPhase !== "out") ufoTrail = [];
      }
      const trailLife = 0.85;
      if (ufoTrail.length) ufoTrail = ufoTrail.filter((p) => ufoClock - p.t <= trailLife);
      if (!showCraft && !ufoTrail.length) return;
      const rot = 0;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      if (ufoTrail.length) {
        const head = ufoTrail[ufoTrail.length - 1];
        const reach = Math.max(size * 3.2, 48);
        for (let i = 0; i < ufoTrail.length; i++) {
          const p = ufoTrail[i];
          const dist = Math.hypot(p.x - head.x, p.y - head.y);
          if (dist < 4) continue;
          const u = 1 - Math.min(1, dist / reach);
          const ageU = Math.max(0, 1 - (ufoClock - p.t) / trailLife);
          const a = u * u * ageU;
          if (a < 0.04) continue;
          const prev = ufoTrail[Math.max(0, i - 1)];
          const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
          ctx.save();
          ctx.globalAlpha = fade * a * 0.42;
          ctx.translate(p.x, p.y);
          if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5) {
            ctx.rotate(ang);
            ctx.scale(1.45, 1);
            ctx.rotate(-ang);
          }
          ctx.drawImage(ufoIcon, -size / 2, -size * 0.56, size, size);
          ctx.restore();
        }
      }
      if (!showCraft) {
        ctx.restore();
        return;
      }
      if (ufoPhase === "scan") {
        const u = live / SCAN;
        const env = Math.min(1, u / 0.16) * Math.min(1, (1 - u) / 0.14);
        const base = Math.atan2(earthY - pos.y, earthX - pos.x);
        const aim = base + Math.sin(u * Math.PI * 3) * 0.4;
        const len = earthR * 0.58;
        const spread = 0.15 + 0.03 * Math.sin(u * 14);
        const x1 = pos.x + Math.cos(aim - spread) * len;
        const y1 = pos.y + Math.sin(aim - spread) * len;
        const x2 = pos.x + Math.cos(aim + spread) * len;
        const y2 = pos.y + Math.sin(aim + spread) * len;
        const mx = pos.x + Math.cos(aim) * len;
        const my = pos.y + Math.sin(aim) * len;
        const beam = ctx.createLinearGradient(pos.x, pos.y, mx, my);
        beam.addColorStop(0, "rgba(214,236,255," + (0.2 * env).toFixed(3) + ")");
        beam.addColorStop(0.42, "rgba(190,220,255," + (0.07 * env).toFixed(3) + ")");
        beam.addColorStop(0.74, "rgba(190,220,255,0)");
        beam.addColorStop(1, "rgba(190,220,255,0)");
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fillStyle = beam;
        ctx.globalAlpha = fade;
        ctx.fill();
      }
      ctx.globalAlpha = fade;
      ctx.translate(pos.x, pos.y);
      ctx.rotate(rot);
      ctx.drawImage(ufoIcon, -size / 2, -size * 0.56, size, size);
      ctx.restore();
    }

    function paint(now) {
      const el = map.getCanvas();
      const W = el.clientWidth || 1;
      const H = el.clientHeight || 1;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const bw = Math.round(W * dpr);
      const bh = Math.round(H * dpr);
      if (cvs.width !== bw || cvs.height !== bh) {
        cvs.width = bw;
        cvs.height = bh;
        tint.width = bw;
        tint.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      tc.setTransform(dpr, 0, 0, dpr, 0, 0);
      tc.clearRect(0, 0, W, H);

      const fov = ((map.getVerticalFieldOfView ? map.getVerticalFieldOfView() : 36.87) * Math.PI) / 180;
      const tFov = Math.tan(fov / 2) || 0.01;
      const focal = (0.5 * H) / tFov;
      const lat = map.getCenter().lat;
      const R = (512 * Math.pow(2, map.getZoom())) / (2 * Math.PI) / Math.cos((lat * Math.PI) / 180);
      const cam = focal;
      const fr = frame();
      const oy = -R * Math.sin(fr.pitch);
      const oz = cam + R * Math.cos(fr.pitch);
      if (oz < 1) return;
      const earthX = W / 2;
      const earthY = H / 2 - (oy / oz) * focal;
      const distO = Math.hypot(oy, oz);
      const limb = Math.sqrt(Math.max(0, distO * distO - R * R));
      const earthR = (focal * R) / Math.max(1, limb);
      const z = map.getZoom();
      let fade = 1;
      if (z > 5.1) fade = Math.max(0, 1 - (z - 5.1) / 1.5);
      if (earthR > Math.max(W, H) * 1.35) fade = 0;
      if (fade <= 0 || !isFinite(earthR)) return;

      const sun = sunAt(new Date());
      const sLat = Math.asin(Math.max(-1, Math.min(1, sun.sφ)));
      const sLon = sun.λ;
      const cS = Math.cos(sLat);
      const S = [cS * Math.cos(sLon), cS * Math.sin(sLon), Math.sin(sLat)];
      const sx = dot(S, fr.X);
      const sy = dot(S, fr.Y);
      const sz = dot(S, fr.Z);
      const sunDisk = 2 * Math.max(4, Math.min(42, focal * Math.tan((0.265 * Math.PI) / 180)));
      const t = now / 1000;
      const g = gmst(new Date());
      // The tele lens leaves only a thin ring of real sky, so the dark margin
      // shows a wider cap (75°) squeezed into the space outside the Earth.
      const limbAng = Math.atan2(Math.max(1, earthR), focal);
      const skyMax = (75 * Math.PI) / 180;
      let sunX = 0;
      let sunY = 0;
      let sunInFront = false;
      let gap = 1;
      if (sz > 0.05) {
        sunX = W / 2 + (sx / sz) * focal;
        sunY = H / 2 - (sy / sz) * focal;
        gap = Math.atan2(Math.hypot(sx, sy), sz) - limbAng;
        const reach = sunDisk * 9;
        if (sunX > -reach && sunY > -reach && sunX < W + reach && sunY < H + reach) sunInFront = true;
      }
      // Atmosphere profile lights up only while the sun is kissing the limb.
      const kiss = gap <= 0
        ? Math.max(0, 1 + gap / 0.12)
        : Math.max(0, 1 - gap / 0.045);
      function project(dir) {
        const px = dot(dir, fr.X);
        const py = dot(dir, fr.Y);
        const pz = dot(dir, fr.Z);
        if (pz <= 0.02) return null;
        const horiz = Math.hypot(px, py);
        if (horiz < 1e-4) return null;
        const span = skyMax - limbAng;
        if (span < 0.2) return null;
        const tt = (Math.atan2(horiz, pz) - limbAng) / span;
        if (tt < 0 || tt > 1) return null;
        const sxu = px / horiz;
        const syu = -py / horiz;
        const tx = sxu !== 0 ? (sxu > 0 ? (W - earthX) / sxu : -earthX / sxu) : 1e9;
        const ty = syu !== 0 ? (syu > 0 ? (H - earthY) / syu : -earthY / syu) : 1e9;
        const edge = Math.max(earthR + 8, Math.min(tx, ty));
        const rad = earthR + 3 + (edge - earthR - 3) * tt;
        const x = earthX + sxu * rad;
        const y = earthY + syu * rad;
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return null;
        const facing = dot(dir, S);
        let night = 1;
        if (facing > 0.74) night = 0;
        else if (facing > 0.12) night = (0.74 - facing) / 0.62;
        if (night <= 0) return null;
        return { x: x, y: y, night: night };
      }
      if (sunInFront) drawSprite();

      // A screen circle around the projected center sits above the real horizon
      // once the camera pitches. Project the 3D limb and blur a stroke along it.
      const limbPitch = fr.pitch;
      const Cy = -R * Math.sin(limbPitch);
      const Cz = cam + R * Math.cos(limbPitch);
      const distC = Math.hypot(Cy, Cz);
      const raw = [];
      if (distC > R + 2) {
        const axisY = Cy / distC;
        const axisZ = Cz / distC;
        const k = 1 - (R * R) / (distC * distC);
        const Ly = Cy * k;
        const Lz = Cz * k;
        const rho = (R * Math.sqrt(distC * distC - R * R)) / distC;
        const steps = 360;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const Tx = rho * ca;
          const Ty = Ly + rho * sa * axisZ;
          const Tz = Lz - rho * sa * axisY;
          if (Tz < 1) {
            raw.push(null);
            continue;
          }
          const vx = Tx;
          const vy = Ty - Cy;
          const vz = Tz - Cz;
          const vn = Math.hypot(vx, vy, vz) || 1;
          raw.push([
            W / 2 + (Tx / Tz) * focal,
            H / 2 - (Ty / Tz) * focal,
            (vx * sx + vy * sy + vz * sz) / vn,
          ]);
        }
      }
      const runs = [];
      let cur = [];
      for (let i = 0; i < raw.length; i++) {
        if (!raw[i]) {
          if (cur.length) runs.push(cur);
          cur = [];
        } else cur.push(raw[i]);
      }
      if (cur.length) runs.push(cur);
      if (raw.length > 1 && raw[0] && raw[raw.length - 1] && runs.length > 1) {
        const last = runs.pop();
        runs[0] = last.concat(runs[0]);
      }
      const fullLoop = raw.length > 0 && runs.length === 1 && raw.every(Boolean);
      const span = Math.max(10, Math.min(28, earthR * 0.045));
      const halo = Math.max(36, Math.min(120, earthR * 0.2));
      function outward(p, dist) {
        let dx = p[0] - earthX;
        let dy = p[1] - earthY;
        const h = Math.hypot(dx, dy) || 1;
        return [p[0] + (dx / h) * dist, p[1] + (dy / h) * dist];
      }
      function strokeLoop(offset, width, color) {
        lg.strokeStyle = color;
        lg.lineWidth = width;
        for (let r = 0; r < runs.length; r++) {
          const run = runs[r];
          const n = run.length;
          const last = fullLoop && r === 0 ? n : n - 1;
          if (last < 1) continue;
          lg.beginPath();
          for (let i = 0; i < last; i++) {
            const p0 = outward(run[i], offset);
            const p1 = outward(run[(i + 1) % n], offset);
            if (i === 0) lg.moveTo(p0[0], p0[1]);
            lg.lineTo(p1[0], p1[1]);
          }
          if (fullLoop && r === 0) lg.closePath();
          lg.stroke();
        }
      }
      let flareDraw = null;
      let entryDraw = null;
      ctx.save();
      ctx.globalAlpha = fade;
      if (runs.length) {
        if (limbCvs.width !== W || limbCvs.height !== H) {
          limbCvs.width = W;
          limbCvs.height = H;
          glowCvs.width = W;
          glowCvs.height = H;
        }
        lg.setTransform(1, 0, 0, 1, 0, 0);
        lg.globalCompositeOperation = "source-over";
        lg.globalAlpha = 1;
        lg.lineCap = "round";
        lg.lineJoin = "round";
        lg.clearRect(0, 0, W, H);
        strokeLoop(halo * 0.62, halo * 1.15, "rgba(4,14,64,0.14)");
        strokeLoop(halo * 0.24, halo * 0.62, "rgba(18,52,140,0.09)");
        const haloBlur = Math.max(16, Math.min(34, halo * 0.3));
        gg.setTransform(1, 0, 0, 1, 0, 0);
        gg.globalCompositeOperation = "source-over";
        gg.globalAlpha = 1;
        gg.filter = "none";
        gg.clearRect(0, 0, W, H);
        gg.filter = "blur(" + haloBlur.toFixed(1) + "px)";
        gg.drawImage(limbCvs, 0, 0);
        gg.filter = "none";
        ctx.drawImage(glowCvs, 0, 0, W, H);
        lg.clearRect(0, 0, W, H);
        // Airglow shield around the whole limb, night side included.
        // Lifted off the ground by about an atmosphere, a bit taller than real.
        const blueAt = span * 0.68;
        const blueW = span * 0.4;
        const greenW = Math.max(1.3, span * 0.11);
        function shieldAlpha(lit, nightA) {
          const dayA = nightA * (2 / 3);
          const t = Math.max(0, Math.min(1, (lit + 0.22) / 0.85));
          const s = t * t * (3 - 2 * t);
          return nightA + (dayA - nightA) * s;
        }
        function strokeShield(offset, width, rgb, nightA) {
          lg.lineCap = "butt";
          lg.lineJoin = "round";
          lg.lineWidth = width;
          for (let r = 0; r < runs.length; r++) {
            const run = runs[r];
            const n = run.length;
            const end = fullLoop && r === 0 ? n : n - 1;
            for (let i = 0; i < end; i++) {
              const i1 = (i + 1) % n;
              const a = (shieldAlpha(run[i][2], nightA) + shieldAlpha(run[i1][2], nightA)) * 0.5;
              const p0 = outward(run[i], offset);
              const p1 = outward(run[i1], offset);
              lg.beginPath();
              lg.moveTo(p0[0], p0[1]);
              lg.lineTo(p1[0], p1[1]);
              lg.strokeStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")";
              lg.stroke();
            }
          }
          lg.lineCap = "round";
        }
        strokeShield(blueAt, blueW, "32,92,214", 0.28);
        strokeShield(blueAt + blueW * 0.5, greenW, "198,236,112", 0.4);
        const shieldBlur = Math.max(1.1, Math.min(2.2, span * 0.07));
        gg.filter = "none";
        gg.clearRect(0, 0, W, H);
        gg.filter = "blur(" + shieldBlur.toFixed(1) + "px)";
        gg.drawImage(limbCvs, 0, 0);
        gg.filter = "none";
        ctx.drawImage(glowCvs, 0, 0, W, H);
        lg.clearRect(0, 0, W, H);
        function earthPath(c) {
          c.beginPath();
          if (fullLoop) {
            const loop = runs[0];
            c.moveTo(loop[0][0], loop[0][1]);
            for (let i = 1; i < loop.length; i++) c.lineTo(loop[i][0], loop[i][1]);
            c.closePath();
          } else if (runs.length) {
            const far = Math.max(W, H) * 4;
            for (let r = 0; r < runs.length; r++) {
              const run = runs[r];
              if (run.length < 2) continue;
              const mid = run[run.length >> 1];
              let dx = earthX - mid[0];
              let dy = earthY - mid[1];
              const hyp = Math.hypot(dx, dy) || 1;
              dx /= hyp;
              dy /= hyp;
              c.moveTo(run[0][0], run[0][1]);
              for (let i = 1; i < run.length; i++) c.lineTo(run[i][0], run[i][1]);
              const b = run[run.length - 1];
              c.lineTo(b[0] + dx * far, b[1] + dy * far);
              c.lineTo(run[0][0] + dx * far, run[0][1] + dy * far);
              c.closePath();
            }
          } else c.arc(earthX, earthY, Math.max(0, earthR - 1), 0, Math.PI * 2);
        }
        function blitTint(blurPx) {
          gg.filter = "none";
          gg.clearRect(0, 0, W, H);
          gg.filter = "blur(" + blurPx.toFixed(1) + "px)";
          gg.drawImage(limbCvs, 0, 0);
          gg.filter = "none";
          tc.save();
          tc.setTransform(dpr, 0, 0, dpr, 0, 0);
          earthPath(tc);
          tc.clip();
          tc.drawImage(glowCvs, 0, 0, W, H);
          tc.restore();
          lg.clearRect(0, 0, W, H);
        }
        // Lit limb, outside-in, matching the orbital photos:
        // deep blue fading into space, a thin cyan-white line, then orange
        // and red against the ground only where the sun is low.
        function paintLit(layers, gainOf) {
          // One continuous stroke per brightness step. Separate round-capped
          // segments read as an LED strip along the limb.
          lg.lineCap = "butt";
          lg.lineJoin = "round";
          const bins = 32;
          for (let r = 0; r < runs.length; r++) {
            const run = runs[r];
            const n = run.length;
            const end = fullLoop && r === 0 ? n : n - 1;
            const gainAt = (idx) => {
              const lit = run[idx][2];
              if (lit < 0.32) return 0;
              const k = Math.pow((lit - 0.32) / 0.68, 1.05);
              const sunward = Math.pow(Math.max(0, (lit - 0.38) / 0.62), 0.65);
              return gainOf(k, sunward);
            };
            for (let band = 0; band < layers.length; band++) {
              const layer = layers[band];
              let pts = [];
              let bin = -1;
              const flush = () => {
                if (pts.length < 2 || bin < 1) {
                  pts = [];
                  return;
                }
                lg.beginPath();
                for (let i = 0; i < pts.length; i++) {
                  const o = outward(pts[i], layer[0]);
                  if (i === 0) lg.moveTo(o[0], o[1]);
                  else lg.lineTo(o[0], o[1]);
                }
                lg.strokeStyle = "rgba(" + layer[2] + "," + ((layer[3] * bin) / bins).toFixed(3) + ")";
                lg.lineWidth = layer[1];
                lg.stroke();
                pts = [];
              };
              for (let i = 0; i <= end; i++) {
                const idx = i % n;
                const g = gainAt(idx);
                const b = g < 0.02 ? 0 : Math.min(bins, Math.max(1, Math.round(g * bins)));
                const pt = run[idx];
                if (b !== bin) {
                  if (pts.length) {
                    pts.push(pt);
                    flush();
                  }
                  bin = b;
                  pts = b > 0 ? [pt] : [];
                } else if (b > 0) pts.push(pt);
              }
              flush();
            }
          }
        }
        function blitLimb(blurPx) {
          gg.filter = "none";
          gg.clearRect(0, 0, W, H);
          gg.filter = "blur(" + blurPx.toFixed(1) + "px)";
          gg.drawImage(limbCvs, 0, 0);
          gg.filter = "none";
          ctx.drawImage(glowCvs, 0, 0, W, H);
          lg.clearRect(0, 0, W, H);
        }
        paintLit(
          [
            [span * 1.45, span * 0.8, "8,24,96", 0.26],
            [span * 0.92, span * 0.95, "12,52,168", 0.52],
            [span * 0.5, span * 0.42, "36,128,236", 0.7],
          ],
          (k, sunward) => k * (1 - sunward * kiss)
        );
        blitLimb(Math.max(3, Math.min(6, span * 0.2)));
        paintLit(
          [[span * 0.16, span * 0.7, "255,228,160", 0.72]],
          (k, sunward) => k * (0.55 + 0.45 * sunward) * (1 - sunward * kiss)
        );
        blitLimb(Math.max(8, Math.min(16, span * 0.5)));
        paintLit(
          [
            [span * 0.22, span * 0.2, "255,120,28", 0.34],
            [span * 0.4, span * 0.24, "255,96,18", 0.14],
          ],
          (k, sunward) => k * (0.55 + 0.45 * sunward) * (1 - sunward * kiss)
        );
        blitLimb(Math.max(3.2, Math.min(6, span * 0.2)));
        paintLit(
          [
            [-span * 0.2, span * 0.85, "255,120,30", 0.72],
            [-span * 0.85, span * 1.25, "255,96,18", 0.4],
            [-span * 1.7, span * 1.5, "255,78,12", 0.16],
          ],
          (k, sunward) => k * (0.55 + 0.45 * sunward) * (1 - sunward * kiss)
        );
        blitTint(Math.max(2.6, Math.min(5, span * 0.16)));
        paintLit(
          [[span * 0.34, Math.max(1.6, span * 0.11), "255,255,255", 1]],
          (k, sunward) => k * (1 - sunward * kiss)
        );
        blitLimb(Math.max(0.5, Math.min(1.6, span * 0.05)));
        if (kiss > 0.05) {
          // Same limb stack as the day side, along the arc the sun is touching,
          // recolored to the sun: deep orange outside, gold, thin white-yellow line.
          const sunGain = (k, sunward) => k * sunward * kiss;
          paintLit(
            [
              [span * 1.45, span * 0.8, "160,32,0", 0.34],
              [span * 0.92, span * 0.9, "255,96,16", 0.58],
              [span * 0.5, span * 0.42, "255,164,40", 0.72],
            ],
            sunGain
          );
          blitLimb(Math.max(3, Math.min(6, span * 0.2)));
          paintLit(
            [[span * 0.16, span * 0.7, "255,214,120", 0.75]],
            sunGain
          );
          blitLimb(Math.max(8, Math.min(16, span * 0.5)));
          paintLit(
            [
              [span * 0.14, span * 0.36, "255,88,12", 0.9],
              [span * 0.03, span * 0.14, "180,16,0", 0.4],
            ],
            sunGain
          );
          blitLimb(Math.max(2.2, Math.min(4.2, span * 0.14)));
          paintLit(
            [[span * 0.34, Math.max(1.6, span * 0.11), "255,252,236", 1]],
            sunGain
          );
          blitLimb(Math.max(0.5, Math.min(1.6, span * 0.05)));
        }
      }
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      if (fullLoop) {
        const loop = runs[0];
        ctx.moveTo(loop[0][0], loop[0][1]);
        for (let i = 1; i < loop.length; i++) ctx.lineTo(loop[i][0], loop[i][1]);
        ctx.closePath();
      } else if (runs.length) {
        const far = Math.max(W, H) * 4;
        for (let r = 0; r < runs.length; r++) {
          const run = runs[r];
          if (run.length < 2) continue;
          const mid = run[run.length >> 1];
          let dx = earthX - mid[0];
          let dy = earthY - mid[1];
          const hyp = Math.hypot(dx, dy) || 1;
          dx /= hyp;
          dy /= hyp;
          ctx.moveTo(run[0][0], run[0][1]);
          for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]);
          const b = run[run.length - 1];
          ctx.lineTo(b[0] + dx * far, b[1] + dy * far);
          ctx.lineTo(run[0][0] + dx * far, run[0][1] + dy * far);
          ctx.closePath();
        }
      } else {
        ctx.arc(earthX, earthY, Math.max(0, earthR - 1.2), 0, Math.PI * 2);
      }
      ctx.clip("evenodd");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < FIELD.length; i++) {
        const st = FIELD[i];
        const p = project(starVec(st.ra, st.dec, g));
        if (!p) continue;
        const tw = 0.72 + 0.28 * Math.sin(t * 1.7 + st.ph);
        const boost = st.boost || 1;
        const a = fade * p.night * (0.55 + st.mag * 0.45) * tw * boost;
        const rad = (st.mag > 0.86 ? 1.55 : st.mag > 0.5 ? 1.05 : 0.7) * (st.glow ? 1.65 : st.boost ? 1.15 : 1);
        if (st.glow) {
          const pulse = 0.55 + 0.45 * Math.sin(t * 0.85 + st.ph);
          const gr = (10 + st.mag * 8) * (0.78 + 0.22 * pulse);
          const glow = ctx.createRadialGradient(p.x, p.y, rad * 0.5, p.x, p.y, gr);
          const ga = a * 0.5 * pulse;
          glow.addColorStop(0, "rgba(214,228,255," + ga + ")");
          glow.addColorStop(0.42, "rgba(186,208,245," + ga * 0.32 + ")");
          glow.addColorStop(1, "rgba(186,208,245,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, gr, 0, Math.PI * 2);
          ctx.fill();
        } else if (st.mag > 0.72) {
          ctx.fillStyle = "rgba(200,220,255," + a * 0.28 + ")";
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad * 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(236,244,255," + a + ")";
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
        ctx.fill();
        if (st.flare) {
          const len = (7 + st.mag * 4) * (0.85 + 0.15 * tw);
          const inner = rad + 0.4;
          const tip = a * 0.7;
          ctx.lineWidth = 0.8;
          ctx.lineCap = "butt";
          for (let k = 0; k < 6; k++) {
            const ang = (k * Math.PI) / 3;
            const cx = Math.cos(ang);
            const sy = Math.sin(ang);
            const x0 = p.x + cx * inner;
            const y0 = p.y + sy * inner;
            const x1 = p.x + cx * len;
            const y1 = p.y + sy * len;
            const ray = ctx.createLinearGradient(x0, y0, x1, y1);
            ray.addColorStop(0, "rgba(236,244,255," + tip + ")");
            ray.addColorStop(1, "rgba(236,244,255,0)");
            ctx.strokeStyle = ray;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }
        }
      }
      ctx.lineWidth = 1;
      for (let f = 0; f < FIGURES.length; f++) {
        const fig = FIGURES[f];
        const pts = [];
        for (let i = 0; i < fig.s.length; i++) {
          pts.push(project(starVec(fig.s[i][0], fig.s[i][1], g)));
        }
        ctx.strokeStyle = "rgba(186,206,230," + 0.42 * fade + ")";
        ctx.beginPath();
        for (let i = 0; i < fig.e.length; i++) {
          const a = pts[fig.e[i][0]];
          const b = pts[fig.e[i][1]];
          if (!a || !b || a.night < 0.35 || b.night < 0.35) continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (!p) continue;
          const tw = 0.7 + 0.3 * Math.sin(t * 2.2 + i + f);
          ctx.fillStyle = "rgba(255,252,245," + fade * p.night * tw + ")";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      if (sunInFront) {
        const size = sunDisk * 16.2;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(sprite, sunX - size / 2, sunY - size / 2, size, size);
        ctx.restore();
        const wrap = gap <= 0
          ? Math.max(0, 1 + gap / 0.16)
          : Math.max(0, 1 - gap / 0.045) * 0.4;
        if (wrap > 0.04 && runs.length) {
          const vx = sunX - earthX;
          const vy = sunY - earthY;
          const vd = Math.hypot(vx, vy) || 1;
          const ux = vx / vd;
          const uy = vy / vd;
          let best = null;
          let bestRun = null;
          let bestI = 0;
          let bestDot = 0.9;
          for (let r = 0; r < runs.length; r++) {
            const run = runs[r];
            for (let i = 0; i < run.length; i++) {
              const dx = run[i][0] - earthX;
              const dy = run[i][1] - earthY;
              const h = Math.hypot(dx, dy) || 1;
              const d = (dx / h) * ux + (dy / h) * uy;
              if (d > bestDot) {
                bestDot = d;
                best = run[i];
                bestRun = run;
                bestI = i;
              }
            }
          }
          if (!best) best = [earthX + ux * earthR, earthY + uy * earthR];
          const ax = best[0] + ux * Math.max(8, span * 0.45);
          const ay = best[1] + uy * Math.max(8, span * 0.45);
          const rad = Math.max(72, sunDisk * 8.1);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const limbGlow = ctx.createRadialGradient(ax, ay, 0, ax, ay, rad);
          limbGlow.addColorStop(0, "rgba(255,248,230," + (0.7 * wrap).toFixed(3) + ")");
          limbGlow.addColorStop(0.2, "rgba(255,176,60," + (0.42 * wrap).toFixed(3) + ")");
          limbGlow.addColorStop(0.48, "rgba(255,64,0," + (0.16 * wrap).toFixed(3) + ")");
          limbGlow.addColorStop(1, "rgba(120,16,0,0)");
          ctx.fillStyle = limbGlow;
          ctx.beginPath();
          ctx.arc(ax, ay, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          // Wide limb glow at the contact. Thick in the middle, pinched to nothing
          // at both tips. Drawn after the sky clip so it also falls on the earth.
          const tongue = Math.max(kiss, wrap);
          if (tongue > 0.08 && bestRun && bestRun.length > 8) {
            const n = bestRun.length;
            const closed = fullLoop && bestRun === runs[0];
            const run = bestRun;
            const at = bestI;
            entryDraw = () => {
              const band = (half, mid, fullWidth, rgb, alpha, blurPx) => {
                const edgeA = [];
                const edgeB = [];
                for (let d = -half; d <= half; d++) {
                  let idx = at + d;
                  if (closed) idx = ((idx % n) + n) % n;
                  else if (idx < 0 || idx >= n) continue;
                  const t = Math.cos((d / half) * Math.PI * 0.5);
                  const w = fullWidth * t;
                  edgeA.push(outward(run[idx], mid - w * 0.5));
                  edgeB.push(outward(run[idx], mid + w * 0.5));
                }
                if (edgeA.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(edgeA[0][0], edgeA[0][1]);
                for (let i = 1; i < edgeA.length; i++) ctx.lineTo(edgeA[i][0], edgeA[i][1]);
                for (let i = edgeB.length - 1; i >= 0; i--) ctx.lineTo(edgeB[i][0], edgeB[i][1]);
                ctx.closePath();
                ctx.fillStyle = "rgba(" + rgb + "," + (alpha * tongue).toFixed(3) + ")";
                ctx.filter = "blur(" + blurPx.toFixed(1) + "px)";
                ctx.fill();
              };
              ctx.save();
              ctx.globalCompositeOperation = "lighter";
              ctx.globalAlpha = fade;
              const soft = Math.max(8, span * 0.55);
              const tight = Math.max(3, span * 0.2);
              band(30, span * 0.85, span * 3.4, "255,140,36", 0.42, soft);
              band(18, span * 0.35, span * 1.15, "255,232,190", 0.7, tight);
              band(28, -span * 1.2, span * 3.8, "255,120,24", 0.4, soft);
              band(16, -span * 0.45, span * 1.35, "255,214,150", 0.62, tight);
              ctx.filter = "none";
              ctx.restore();
            };
          }
        }
        const rise = Math.max(0, Math.min(1, (gap + 0.03) / 0.025));
        const fall = gap < 0.1 ? 1 : Math.max(0, 1 - (gap - 0.1) / 0.4);
        const flare = rise * fall;
        if (flare > 0.04) {
          let ax = sunX;
          let ay = sunY;
          const vx = sunX - earthX;
          const vy = sunY - earthY;
          const vd = Math.hypot(vx, vy) || 1;
          if (gap < 0.06) {
            const ux = vx / vd;
            const uy = vy / vd;
            let best = null;
            let bestDot = 0.9;
            for (let r = 0; r < runs.length; r++) {
              const run = runs[r];
              for (let i = 0; i < run.length; i++) {
                const dx = run[i][0] - earthX;
                const dy = run[i][1] - earthY;
                const h = Math.hypot(dx, dy) || 1;
                const d = (dx / h) * ux + (dy / h) * uy;
                if (d > bestDot) {
                  bestDot = d;
                  best = run[i];
                }
              }
            }
            if (!best) best = [earthX + ux * earthR, earthY + uy * earthR];
            const pull = Math.max(0, Math.min(1, (0.06 - gap) / 0.08));
            ax = sunX + (best[0] - sunX) * pull;
            ay = sunY + (best[1] - sunY) * pull;
          }
          flareDraw = {
            ax: ax,
            ay: ay,
            toX: W / 2 - ax,
            toY: H / 2 - ay,
            flare: flare,
          };
        }
      }
      ctx.restore();
      if (entryDraw) entryDraw();
      if (flareDraw) {
        const ax = flareDraw.ax;
        const ay = flareDraw.ay;
        const toX = flareDraw.toX;
        const toY = flareDraw.toY;
        const flare = flareDraw.flare;
        const len = Math.min(Math.min(W, H) * 0.46, 640);
        const thick = Math.max(16, sunDisk * 2.4);
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(toY, toX));
        ctx.scale(len / thick, 1);
        const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, thick);
        streak.addColorStop(0, "rgba(255,248,230," + (0.5 * flare).toFixed(3) + ")");
        streak.addColorStop(0.22, "rgba(255,176,70," + (0.22 * flare).toFixed(3) + ")");
        streak.addColorStop(1, "rgba(255,120,30,0)");
        ctx.fillStyle = streak;
        ctx.beginPath();
        ctx.arc(0, 0, thick, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.globalCompositeOperation = "lighter";
        const ghosts = [
          [0.62, sunDisk * 6.2, 0.14, "255,186,80"],
          [1.2, sunDisk * 3.4, 0.09, "255,230,190"],
        ];
        for (let gi = 0; gi < ghosts.length; gi++) {
          const gx = ax + toX * ghosts[gi][0];
          const gy = ay + toY * ghosts[gi][0];
          const gr = ghosts[gi][1];
          const ga = ghosts[gi][2] * flare;
          const ghost = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          ghost.addColorStop(0, "rgba(" + ghosts[gi][3] + "," + ga.toFixed(3) + ")");
          ghost.addColorStop(1, "rgba(" + ghosts[gi][3] + ",0)");
          ctx.fillStyle = ghost;
          ctx.beginPath();
          ctx.arc(gx, gy, gr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      drawRoutes(now, { earthR: earthR, fade: fade, fr: fr, oy: oy, oz: oz, W: W, H: H, focal: focal, R: R });
      drawCraft(now, { earthR: earthR, fade: fade, fr: fr, oy: oy, oz: oz, W: W, H: H, focal: focal, R: R });
      drawUfo(now, { earthX: earthX, earthY: earthY, earthR: earthR, fade: fade, W: W, H: H });
    }

    function loop(now) {
      try { paint(now); } catch (err) { console.warn("sun", err); }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function quietDragPan(map) {
    if (map.dragPan && map.dragPan.enable) {
      map.dragPan.enable({ deceleration: 20000, maxSpeed: 1, linearity: 0.05 });
    }
  }

  function installDragInertia(map) {
    quietDragPan(map);
    const el = map.getCanvasContainer();
    if (!el) return;
    let drag = null;
    let coast = null;
    let raf = 0;
    let trackRaf = 0;

    function stopCoast() {
      coast = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    window.addEventListener("msfs-input", stopCoast);

    function snap() {
      const c = map.getCenter();
      return {
        t: performance.now(),
        lng: c.lng,
        lat: c.lat,
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
    }

    function pushSample(list, s) {
      list.push(s);
      const cutoff = s.t - 140;
      while (list.length > 2 && list[0].t < cutoff) list.shift();
    }

    function trackFrame() {
      trackRaf = 0;
      if (!drag) return;
      pushSample(drag.samples, snap());
    }

    window.addEventListener("pointerdown", (e) => {
      if (e.button === 0 || e.button === 2) stopCoast();
    }, true);

    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      if (e.button !== 0 && e.button !== 2) return;
      if (e.button === 0 && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)) return;
      const now = performance.now();
      drag = {
        button: e.button,
        samples: [snap()],
        mice: [{ t: now, x: e.clientX, y: e.clientY }],
      };
    });

    window.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const mask = drag.button === 2 ? 2 : 1;
      if ((e.buttons & mask) === 0) return;
      pushSample(drag.mice, { t: performance.now(), x: e.clientX, y: e.clientY });
      if (!trackRaf) trackRaf = requestAnimationFrame(trackFrame);
    });

    function endDrag(e) {
      if (!drag || e.button !== drag.button) return;
      pushSample(drag.samples, snap());
      pushSample(drag.mice, { t: performance.now(), x: e.clientX, y: e.clientY });
      if (trackRaf) cancelAnimationFrame(trackRaf);
      trackRaf = 0;
      const samples = drag.samples;
      const mice = drag.mice;
      drag = null;
      if (samples.length < 2 || mice.length < 2) return;
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      let dlng = b.lng - a.lng;
      if (dlng > 180) dlng -= 360;
      if (dlng < -180) dlng += 360;
      let dbear = b.bearing - a.bearing;
      if (dbear > 180) dbear -= 360;
      if (dbear < -180) dbear += 360;
      let vlng = dlng / dt;
      let vlat = (b.lat - a.lat) / dt;
      let vpitch = (b.pitch - a.pitch) / dt;
      let vbear = dbear / dt;
      const m0 = mice[0];
      const m1 = mice[mice.length - 1];
      const mdt = Math.max(0.016, (m1.t - m0.t) / 1000);
      const mouseSpeed = Math.hypot(m1.x - m0.x, m1.y - m0.y) / mdt;
      if (mouseSpeed < 80 && Math.abs(vpitch) < 10 && Math.abs(vbear) < 10) return;
      if (Math.abs(vpitch) < 6) vpitch = 0;
      if (Math.abs(vbear) < 6) vbear = 0;
      const pxPerDeg = (512 * Math.pow(2, map.getZoom())) / 360;
      const geoCap = Math.min(1200, 6000 / Math.max(1, pxPerDeg));
      const geo = Math.hypot(vlng, vlat);
      if (geo > geoCap) {
        vlng *= geoCap / geo;
        vlat *= geoCap / geo;
      }
      vpitch = Math.max(-200, Math.min(200, vpitch));
      vbear = Math.max(-360, Math.min(360, vbear));
      coast = { vlng: vlng, vlat: vlat, vpitch: vpitch, vbear: vbear };
      let last = performance.now();
      const step = (now) => {
        if (!coast) return;
        const stepDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        if (stepDt <= 0) {
          raf = requestAnimationFrame(step);
          return;
        }
        const c = map.getCenter();
        const lat = Math.max(-85, Math.min(85, c.lat + coast.vlat * stepDt));
        if (lat <= -85 || lat >= 85) coast.vlat = 0;
        const lng = c.lng + coast.vlng * stepDt;
        const maxPitch = map.getMaxPitch ? map.getMaxPitch() : 78;
        const pitch = Math.max(0, Math.min(maxPitch, map.getPitch() + coast.vpitch * stepDt));
        const bearing = map.getBearing() + coast.vbear * stepDt;
        const keep = Math.exp(-stepDt / 0.85);
        coast.vlng *= keep;
        coast.vlat *= keep;
        coast.vpitch *= keep;
        coast.vbear *= keep;
        const stopGeo = 40 / Math.max(1, (512 * Math.pow(2, map.getZoom())) / 360);
        if (Math.hypot(coast.vlng, coast.vlat) < stopGeo && Math.abs(coast.vpitch) < 0.45 && Math.abs(coast.vbear) < 0.45) {
          coast = null;
          raf = 0;
          return;
        }
        try {
          map.stop();
          map.jumpTo({ center: [lng, lat], pitch: pitch, bearing: bearing });
        } catch (err) {
          coast = null;
          raf = 0;
          return;
        }
        raf = requestAnimationFrame(step);
      };
      map.stop();
      raf = requestAnimationFrame(step);
    }

    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", () => {
      drag = null;
      if (trackRaf) cancelAnimationFrame(trackRaf);
      trackRaf = 0;
      stopCoast();
    });
    window.addEventListener("keydown", (e) => {
      const k = e.key && e.key.length === 1 ? e.key.toLowerCase() : "";
      if ("wasdqe".includes(k)) stopCoast();
    }, true);
    el.addEventListener("wheel", stopCoast, { passive: true });
    window.addEventListener("blur", () => {
      drag = null;
      if (trackRaf) cancelAnimationFrame(trackRaf);
      trackRaf = 0;
      stopCoast();
    });
  }

  function installRose(map) {
    const tilt = document.getElementById("rose-tilt");
    const disk = document.getElementById("rose-disk");
    const rose = document.getElementById("rose");
    if (!tilt || !disk) return;
    let queued = false;
    function paint() {
      queued = false;
      tilt.style.transform = "rotateX(" + map.getPitch().toFixed(2) + "deg)";
      disk.style.transform = "rotateZ(" + (-map.getBearing()).toFixed(2) + "deg)";
    }
    function queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }
    function level(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      map.easeTo({ bearing: 0, pitch: 0, duration: 650 });
    }
    map.on("move", queue);
    map.on("load", paint);
    paint();
    if (!rose) return;
    rose.addEventListener("click", level);
    rose.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") level(e);
    });
  }

  // SpaceMouse Pro, HID raw. +ty toward the user.
  // Translation: only forward/back zooms. Pull toward you zooms in.
  // Sideways and up/down are ignored.
  // Twist from above (rz) rotates the earth with the cap. +rz is backwards.
  // Pitch (rx) brings a pole toward the front. +rx is backwards.
  // Side tilt (ry) stays on the bearing.
  // The driver used to turn that nod into a mouse wheel; the map swallows wheel
  // events while the cap is tilted so the page does not zoom on top.
  function installSpaceMouse(map) {
    const url = "ws://127.0.0.1:39231/";
    const dead = 0.08;
    let axes = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };
    let alive = false;
    let gen = 0;
    let last = 0;
    let delay = 2000;
    let socket = null;
    let zoomCmd = 0;
    let swallowWheelUntil = 0;
    window.addEventListener(
      "wheel",
      (e) => {
        if (performance.now() < swallowWheelUntil) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    function norm(v) {
      let x = Number(v) || 0;
      const a = Math.abs(x);
      if (a > 1200) x /= 2048;
      else if (a > 1.5) x /= 350;
      if (Math.abs(x) < dead) return 0;
      const u = Math.min(1, (Math.abs(x) - dead) / (1 - dead));
      return Math.sign(x) * u;
    }

    function tick(now, myGen) {
      if (myGen !== gen || !alive) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const ty = norm(axes.ty);
      const rx = norm(axes.rx);
      const ry = norm(axes.ry);
      const rz = norm(axes.rz);
      if (Math.abs(Number(axes.rx) || 0) > 25) swallowWheelUntil = performance.now() + 160;
      zoomCmd = approach(zoomCmd, ty * Math.abs(ty), dt, 0.2);
      if ((ty || rx || ry || rz || Math.abs(zoomCmd) > 0.002) && dt > 0) {
        window.dispatchEvent(new Event("msfs-input"));
        const z = map.getZoom();
        const c = map.getCenter();
        const bearing = (map.getBearing() * Math.PI) / 180;
        const roll = -rx * 36 * dt;
        let lat = c.lat + roll * Math.cos(bearing);
        lat = Math.max(-85, Math.min(85, lat));
        let lng = c.lng + roll * Math.sin(bearing) - rz * 42 * dt;
        lng = ((lng + 540) % 360) - 180;
        const zoom = Math.max(0.4, Math.min(18, z + zoomCmd * 1.15 * dt));
        const bearingDeg = map.getBearing() + ry * 35 * dt;
        try {
          map.stop();
          map.jumpTo({ center: [lng, lat], zoom: zoom, pitch: map.getPitch(), bearing: bearingDeg });
        } catch (err) {
          /* style still loading */
        }
      }
      requestAnimationFrame((t) => tick(t, myGen));
    }

    function connect() {
      if (socket && (socket.readyState === 0 || socket.readyState === 1)) return;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        window.setTimeout(connect, delay);
        delay = Math.min(15000, delay * 2);
        return;
      }
      socket = ws;
      ws.onopen = () => {
        alive = true;
        delay = 2000;
        gen += 1;
        const myGen = gen;
        last = performance.now();
        requestAnimationFrame((t) => tick(t, myGen));
      };
      ws.onmessage = (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m && typeof m === "object") axes = m;
        } catch (err) {
          /* ignore a bad sample */
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        alive = false;
        gen += 1;
        zoomCmd = 0;
        axes = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 };
        if (socket === ws) socket = null;
        window.setTimeout(connect, delay);
        delay = Math.min(15000, delay * 2);
      };
    }

    connect();
  }

  function installPinGlow(map) {
    const host = map.getContainer() && map.getContainer().parentElement;
    if (!host) return;
    if (!document.getElementById("pin-led-style")) {
      const st = document.createElement("style");
      st.id = "pin-led-style";
      st.textContent = ".pin-led{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}";
      document.head.appendChild(st);
    }
    const cvs = document.createElement("canvas");
    cvs.className = "pin-led";
    host.appendChild(cvs);
    const ctx = cvs.getContext("2d");
    const dot = document.createElement("canvas");
    dot.width = dot.height = 32;
    const dg = dot.getContext("2d");
    const glow = dg.createRadialGradient(16, 16, 2, 16, 16, 16);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.28, "rgba(255,255,255,1)");
    glow.addColorStop(0.46, "rgba(255,255,255,0.12)");
    glow.addColorStop(0.58, "rgba(255,255,255,0)");
    dg.fillStyle = glow;
    dg.beginPath();
    dg.arc(16, 16, 16, 0, Math.PI * 2);
    dg.fill();
    const rhythm = new Map();

    function rhythmOf(id) {
      const key = String(id);
      const cached = rhythm.get(key);
      if (cached) return cached;
      let n = 2166136261;
      for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 16777619);
      n >>>= 0;
      const made = {
        phase: ((n % 4096) / 4096) * Math.PI * 2,
        hz: 0.38 + ((n >>> 12) % 1000) / 1000 * 0.9,
        depth: 0.78 + ((n >>> 22) % 1000) / 1000 * 0.22,
      };
      rhythm.set(key, made);
      return made;
    }

    function iconScale(z) {
      const stops = [[0, 0.32], [4, 0.48], [8, 0.7], [13, 0.95]];
      if (z <= 0) return 0.32;
      if (z >= 13) return 0.95;
      for (let i = 1; i < stops.length; i++) {
        if (z <= stops[i][0]) {
          const t = (z - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
          return stops[i - 1][1] + (stops[i][1] - stops[i - 1][1]) * t;
        }
      }
      return 0.95;
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const el = map.getCanvas();
      if (!el) return;
      const W = el.clientWidth || 1;
      const H = el.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const bw = Math.round(W * dpr);
      const bh = Math.round(H * dpr);
      if (cvs.width !== bw || cvs.height !== bh) {
        cvs.width = bw;
        cvs.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!map.getLayer("pins")) return;
      let feats;
      try {
        feats = map.queryRenderedFeatures({ layers: ["pins"] });
      } catch (err) {
        return;
      }
      if (!feats || !feats.length) return;
      const scale = iconScale(map.getZoom());
      const arm = 38 * scale;
      const rad = Math.max(1.2, 4.2 * scale);
      const t = now / 1000;
      const seen = new Set();
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const id = f.properties && f.properties.id;
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        const coords = f.geometry && f.geometry.coordinates;
        if (!coords) continue;
        const pt = map.project(coords);
        if (!pt) continue;
        const spin = ((Number(f.properties.spin) || 0) * Math.PI) / 180;
        const x = pt.x + Math.sin(spin) * arm;
        const y = pt.y - Math.cos(spin) * arm;
        if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
        const rh = rhythmOf(id);
        const wave = 0.5 + 0.5 * Math.sin(t * rh.hz * Math.PI * 2 + rh.phase);
        ctx.globalAlpha = (0.12 + 0.68 * wave) * rh.depth;
        ctx.drawImage(dot, x - rad, y - rad, rad * 2, rad * 2);
      }
      ctx.globalAlpha = 1;
    }

    requestAnimationFrame(frame);
  }

  function installIdleSpin(map) {
    // One turn every 3 minutes. West to east, so with north up the ground drifts right.
    // Ignores the system "reduced motion" switch. Keeps turning at a held zoom
    // while at least 30% of the disk is still inside the viewport.
    const degPerSec = 360 / 180;
    const SPIN_MIN_VIS = 0.3;
    let spinning = false;
    let last = 0;
    let idleTimer = 0;
    let started = false;
    function wholeEarth() {
      const el = map.getContainer();
      const H = (el && el.clientHeight) || 1;
      const fov = map.getVerticalFieldOfView ? map.getVerticalFieldOfView() : 36.87;
      const frac = globeDiskFraction(map.getZoom(), fov, H, map.getCenter().lat);
      return frac > 0 && 1 / frac >= SPIN_MIN_VIS;
    }
    function arm() {
      spinning = false;
      globeIdle = false;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        if (wholeEarth()) {
          spinning = true;
          globeIdle = true;
        }
      }, 3000);
    }
    function onMap(e) {
      const el = map.getContainer();
      return !!(el && e.target && el.contains(e.target));
    }
    window.addEventListener("pointerdown", (e) => { if (onMap(e)) arm(); }, true);
    window.addEventListener("wheel", (e) => { if (onMap(e)) arm(); }, true);
    window.addEventListener("keydown", (e) => {
      if (typingTarget() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD" || e.code === "KeyQ" || e.code === "KeyE") arm();
    }, true);
    window.addEventListener("msfs-input", arm);
    function frame(now) {
      if (!motionOn) spinning = false;
      if (spinning && !wholeEarth()) spinning = false;
      globeIdle = spinning;
      if (!last) last = now;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (spinning && dt > 0) {
        const c = map.getCenter();
        let lng = c.lng - degPerSec * dt;
        lng = ((lng + 540) % 360) - 180;
        map.jumpTo({ center: [lng, c.lat] });
      }
      requestAnimationFrame(frame);
    }
    function boot() {
      if (started) return;
      started = true;
      if (motionOn && wholeEarth()) spinning = true;
      requestAnimationFrame(frame);
    }
    resumeMotion = function () {
      if (!motionOn) {
        spinning = false;
        globeIdle = false;
        window.clearTimeout(idleTimer);
        return;
      }
      window.clearTimeout(idleTimer);
      if (wholeEarth()) {
        spinning = true;
        globeIdle = true;
      }
    };
    if (map.loaded()) boot();
    map.on("load", boot);
  }

  function installScale(map) {
    const hint = document.querySelector(".map-hint");
    if (!hint || !hint.parentElement || document.getElementById("scale-rule")) return;
    if (!document.getElementById("scale-rule-style")) {
      const st = document.createElement("style");
      st.id = "scale-rule-style";
      st.textContent =
        ".scale-rule{position:absolute;z-index:1000;pointer-events:none;height:26px;}" +
        ".scale-rule b{position:absolute;left:0;right:0;bottom:13px;text-align:center;" +
        "font:600 12px/1 var(--font,Segoe UI,system-ui,sans-serif);color:#fff;letter-spacing:.02em;" +
        "text-shadow:0 1px 2px #000,0 0 3px #000;}" +
        ".scale-rule i{position:absolute;left:0;right:0;bottom:0;height:11px;" +
        "border-bottom:1px solid #fff;filter:drop-shadow(0 0 1px #000);}" +
        ".scale-rule em{position:absolute;bottom:0;width:1px;background:#fff;}" +
        ".scale-rule em.e{height:11px;}" +
        ".scale-rule em.m{left:50%;height:7px;transform:translateX(-50%);}" +
        ".scale-rule em.q{height:4px;transform:translateX(-50%);}" +
        ".scale-rule em.l{left:0;}" +
        ".scale-rule em.q1{left:25%;}" +
        ".scale-rule em.q3{left:75%;}" +
        ".scale-rule em.r{right:0;}";
      document.head.appendChild(st);
    }
    const bar = document.createElement("div");
    bar.id = "scale-rule";
    bar.className = "scale-rule";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = "<b></b><i><em class=\"e l\"></em><em class=\"q q1\"></em><em class=\"m\"></em><em class=\"q q3\"></em><em class=\"e r\"></em></i>";
    hint.parentElement.appendChild(bar);
    const label = bar.querySelector("b");

    function fmt(meters) {
      if (!(meters > 0) || meters > 12000000) return "";
      const pt = (document.documentElement.lang || "").toLowerCase().indexOf("pt") === 0;
      const loc = pt ? "pt-BR" : "en-US";
      const n = (v, d) =>
        v.toLocaleString(loc, { maximumFractionDigits: d, minimumFractionDigits: d });
      if (meters >= 10000) return n(Math.round(meters / 1000), 0) + " km";
      if (meters >= 1000) return n(Math.round(meters / 100) / 10, 1) + " km";
      if (meters >= 100) return n(Math.round(meters / 10) * 10, 0) + " m";
      return n(Math.max(1, Math.round(meters)), 0) + " m";
    }

    function ground(x0, x1, y) {
      let a;
      let b;
      try {
        a = map.unproject([x0, y]);
        b = map.unproject([x1, y]);
      } catch (err) {
        return NaN;
      }
      if (!a || !b || !isFinite(a.lat) || !isFinite(b.lat)) return NaN;
      const R = 6378137;
      const p1 = (a.lat * Math.PI) / 180;
      const p2 = (b.lat * Math.PI) / 180;
      const dp = ((b.lat - a.lat) * Math.PI) / 180;
      let dl = ((b.lng - a.lng) * Math.PI) / 180;
      dl = Math.atan2(Math.sin(dl), Math.cos(dl));
      const h =
        Math.sin(dp / 2) * Math.sin(dp / 2) +
        Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    let queued = false;
    function tick() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const host = hint.parentElement;
        if (!host) return;
        const hr = hint.getBoundingClientRect();
        const pr = host.getBoundingClientRect();
        const chromeOff = document.body.classList.contains("chrome-off");
        let width = hr.width;
        let left = hr.left - pr.left;
        let bottom = pr.bottom - hr.top + 8;
        if (chromeOff || !(width > 8)) {
          width = Math.max(150, Math.min(210, pr.width * 0.2));
          left = 18;
          bottom = 46;
        }
        bar.style.left = left + "px";
        bar.style.width = width + "px";
        bar.style.bottom = bottom + "px";
        const mr = map.getContainer().getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        const y = (chromeOff ? br.top : hr.top) - mr.top - 4;
        const x0 = (chromeOff ? br.left : hr.left) - mr.left;
        const x1 = (chromeOff ? br.right : hr.right) - mr.left;
        let meters = ground(x0, x1, y);
        if (!(meters > 0) || meters > 12000000) {
          const c = map.project(map.getCenter());
          if (c) meters = ground(c.x - width / 2, c.x + width / 2, c.y);
        }
        label.textContent = fmt(meters);
      });
    }

    map.on("move", tick);
    map.on("resize", tick);
    if (window.ResizeObserver) new ResizeObserver(tick).observe(hint);
    window.addEventListener("resize", tick);
    map.on("load", tick);
    tick();
  }

  function createMapLibre(opts) {
    const map = new maplibregl.Map({
      container: opts.container,
      style: opts.style || earthStyle(false),
      // 12°N sits Brazil low in the disk. Near November the sun then
      // grazes the bottom limb as the night side comes around.
      center: [-58, 12],
      zoom: 2.75,
      minZoom: 1.45,
      pitch: 0,
      maxPitch: 78,
      attributionControl: { compact: true },
      dragRotate: true,
      pitchWithRotate: true,
      boxZoom: false,
    });
    const popup = new maplibregl.Popup({
      closeButton: true,
      maxWidth: "320px",
      offset: 24,
      className: "pg-popup",
    });
    let ready = false;
    const pending = [];
    const images = new Set();
    map.on("load", () => {
      ready = true;
      map.addSource("places", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "pins",
        type: "symbol",
        source: "places",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-anchor": "bottom",
          "icon-rotate": ["get", "spin"],
          "icon-rotation-alignment": "viewport",
          "icon-pitch-alignment": "viewport",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 0.32, 4, 0.48, 8, 0.7, 13, 0.95],
        },
      });
      map.on("click", "pins", (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        e.originalEvent.stopPropagation();
        opts.onPick(Number(f.properties.id));
      });
      map.on("mouseenter", "pins", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pins", () => {
        map.getCanvas().style.cursor = "";
      });
      pending.splice(0).forEach((fn) => fn());
    });
    map.on("error", (e) => console.warn("map", e && e.error));

    let pinFeatures = [];
    let leanQueued = false;
    function leanPins() {
      if (!pinFeatures.length) return;
      const gc = globeScreenCenter(map);
      for (let i = 0; i < pinFeatures.length; i++) {
        const pt = map.project(pinFeatures[i].geometry.coordinates);
        if (!pt) continue;
        const dx = pt.x - gc.x;
        const dy = pt.y - gc.y;
        pinFeatures[i].properties.spin = (Math.atan2(dx, -dy) * 180) / Math.PI;
      }
      const src = map.getSource("places");
      if (src) src.setData({ type: "FeatureCollection", features: pinFeatures });
    }
    function queueLean() {
      if (leanQueued) return;
      leanQueued = true;
      requestAnimationFrame(() => {
        leanQueued = false;
        if (!ready) return;
        try {
          leanPins();
        } catch (err) {
          console.warn("pins", err);
        }
      });
    }
    map.on("move", queueLean);

    function whenReady(fn) {
      if (ready) fn();
      else pending.push(fn);
    }
    function ensureIcon(color) {
      const id = "pin-" + String(color).replace("#", "");
      if (images.has(id) || map.hasImage(id)) {
        images.add(id);
        return id;
      }
      const canvas = pinCanvas(color);
      map.addImage(id, canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: 2 });
      images.add(id);
      return id;
    }

    if (map.scrollZoom && map.scrollZoom.setWheelZoomRate) map.scrollZoom.setWheelZoomRate(1 / 1400);
    installLens(map);
    installDragInertia(map);
    installSpaceMouse(map);
    installRose(map);
    installSun(map);
    installPinGlow(map);
    installIdleSpin(map);
    installScale(map);
    map.on("load", () => {
      let bucket = sunBucket(new Date());
      window.setInterval(() => {
        const next = sunBucket(new Date());
        if (next === bucket) return;
        bucket = next;
        const src = map.getSource("satellite");
        if (src && src.setTiles) src.setTiles(["msfsgrade://v2/" + next + "/{z}/{x}/{y}"]);
      }, 60000);
    });
    let panEase = 0;
    let panX = 0;
    let panY = 0;
    let zoomEase = 0;
    let zoomSign = 0;
    const panScale = 1.1;
    const zoomScale = 0.18;
    installKeys((down, dt, boost) => {
      const z = map.getZoom();
      const c = map.getCenter();
      const bearing = (map.getBearing() * Math.PI) / 180;
      let dx = 0;
      let dy = 0;
      if (down.has("w")) {
        dx += Math.sin(bearing);
        dy += Math.cos(bearing);
      }
      if (down.has("s")) {
        dx -= Math.sin(bearing);
        dy -= Math.cos(bearing);
      }
      if (down.has("d")) {
        dx += Math.cos(bearing);
        dy -= Math.sin(bearing);
      }
      if (down.has("a")) {
        dx -= Math.cos(bearing);
        dy += Math.sin(bearing);
      }
      const pressingPan = dx !== 0 || dy !== 0;
      if (pressingPan) {
        const len = Math.hypot(dx, dy) || 1;
        panX = dx / len;
        panY = dy / len;
      }
      panEase = approach(panEase, pressingPan ? 1 : 0, dt, pressingPan ? 0.45 : 0.7);
      let zoomDir = 0;
      if (down.has("q")) zoomDir += 1;
      if (down.has("e")) zoomDir -= 1;
      if (zoomDir) zoomSign = Math.sign(zoomDir);
      zoomEase = approach(zoomEase, zoomDir ? 1 : 0, dt, zoomDir ? 0.4 : 0.65);
      const panGain = smoothstep(panEase) * panScale * boost;
      const zoomGain = smoothstep(zoomEase) * zoomScale * boost;
      const patch = {};
      if (panGain > 0.0008) {
        const step = (18 / Math.pow(2, z)) * dt * panGain;
        const lat = Math.max(-85, Math.min(85, c.lat + panY * step));
        patch.center = [c.lng + panX * step, lat];
      }
      if (zoomGain > 0.0008 && zoomSign) {
        const next = z + zoomSign * 0.45 * dt * zoomGain;
        patch.zoom = Math.max(0.4, Math.min(18, next));
      }
      if (patch.center || patch.zoom != null) map.jumpTo(patch);
    });

    let politicalWanted = false;
    let stateLinesLoading = false;
    return {
      kind: "maplibre",
      setDrag(on) {
        if (on) quietDragPan(map);
        else map.dragPan.disable();
      },
      setMotion(on) {
        motionOn = !!on;
        resumeMotion();
      },
      setPolitical(on) {
        politicalWanted = !!on;
        whenReady(() => {
          const apply = () => {
            const vis = politicalWanted ? "visible" : "none";
            POLI_LAYERS.forEach((id) => {
              if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
            });
          };
          if (politicalWanted && !map.getSource("political-states")) {
            apply();
            if (stateLinesLoading) return;
            const add = (data) => {
              stateLinesLoading = false;
              if (!data || map.getSource("political-states")) {
                apply();
                return;
              }
              map.addSource("political-states", {
                type: "geojson",
                data: data,
                tolerance: 0,
                buffer: 512,
                maxzoom: 6,
              });
              const layer = {
                id: "poli-state-line",
                type: "line",
                source: "political-states",
                layout: { "line-cap": "butt", "line-join": "round", visibility: "none" },
                paint: {
                  "line-color": "#000",
                  "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 4, 0.5, 7, 0.88, 9, 0.95],
                  "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 4, 0.85, 7, 2.6, 9, 3.4],
                },
              };
              if (map.getLayer("poli-country-line")) map.addLayer(layer, "poli-country-line");
              else map.addLayer(layer);
              apply();
            };
            if (window.MSFS_ADMIN1) add(window.MSFS_ADMIN1);
            else {
              stateLinesLoading = true;
              const s = document.createElement("script");
              s.src = "admin1-lines.js?v=20261101-states";
              s.onload = () => add(window.MSFS_ADMIN1);
              s.onerror = () => {
                stateLinesLoading = false;
              };
              document.head.appendChild(s);
            }
            return;
          }
          apply();
        });
      },
      setPlaceLang(lang) {
        whenReady(() => {
          const field = placeNameField(lang);
          ["poli-country-label", "poli-state-label"].forEach((id) => {
            if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", field);
          });
        });
      },
      hits(places, x1, y1, x2, y2) {
        return screenHits(
          places,
          (p) => map.project([p.lon, p.lat]),
          x1,
          y1,
          x2,
          y2
        );
      },
      refresh(places, colorOf) {
        whenReady(() => {
          pinFeatures = places.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            properties: { id: p.id, icon: ensureIcon(colorOf(p)), spin: 0 },
          }));
          leanPins();
        });
      },
      flyTo(p) {
        whenReady(() => {
          map.easeTo({
            center: [p.lon, p.lat],
            zoom: Math.max(map.getZoom(), 8.5),
            pitch: Math.max(map.getPitch(), 52),
            duration: 900,
          });
        });
      },
      fit(list) {
        whenReady(() => {
          if (!list.length) return;
          if (list.length === 1) {
            map.easeTo({ center: [list[0].lon, list[0].lat], zoom: 8, duration: 700 });
            return;
          }
          const b = new maplibregl.LngLatBounds();
          list.forEach((p) => b.extend([p.lon, p.lat]));
          map.fitBounds(b, { padding: 48, duration: 800, maxZoom: 8 });
        });
      },
      showPopup(p, html) {
        whenReady(() => {
          popup.setLngLat([p.lon, p.lat]).setHTML(html).addTo(map);
        });
      },
    };
  }

  function createCesium(opts) {
    const viewer = new Cesium.Viewer(opts.container, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          maximumLevel: 19,
          credit: "Imagery © Esri",
        })
      ),
    });
    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.minimumZoomDistance = 40;
    ctrl.maximumZoomDistance = 42000000;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#07090d");
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(12, 22, 18000000),
    });

    const pins = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    const cache = new Map();
    let clamp = Cesium.HeightReference.CLAMP_TO_GROUND;
    const popupEl = document.getElementById(opts.popupId);
    let popupPlace = null;
    const occluder = new Cesium.EllipsoidalOccluder(Cesium.Ellipsoid.WGS84, viewer.camera.position);

    function canvasFor(color) {
      let c = cache.get(color);
      if (!c) {
        c = pinCanvas(color);
        cache.set(color, c);
      }
      return c;
    }
    function applyClamp() {
      for (let i = 0; i < pins.length; i++) pins.get(i).heightReference = clamp;
    }

    Cesium.Cesium3DTileset.fromUrl(
      "https://tile.googleapis.com/v1/3dtiles/root.json?key=" + encodeURIComponent(opts.googleKey),
      { showCreditsOnScreen: true }
    )
      .then((tileset) => {
        viewer.scene.primitives.add(tileset);
        if (Cesium.HeightReference.CLAMP_TO_3D_TILE != null) {
          clamp = Cesium.HeightReference.CLAMP_TO_3D_TILE;
          applyClamp();
        }
        viewer.scene.globe.show = false;
        if (opts.onGoogle) opts.onGoogle(true);
      })
      .catch((err) => {
        console.warn("Google 3D tiles", err);
        if (opts.onGoogle) opts.onGoogle(false);
      });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && typeof picked.id === "number") {
        opts.onPick(picked.id);
        return;
      }
      if (popupEl) popupEl.hidden = true;
      popupPlace = null;
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewer.scene.postRender.addEventListener(() => {
      if (!popupPlace || !popupEl || popupEl.hidden) return;
      const win = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        Cesium.Cartesian3.fromDegrees(popupPlace.lon, popupPlace.lat)
      );
      if (!win) {
        popupEl.hidden = true;
        return;
      }
      popupEl.style.left = Math.round(win.x + 16) + "px";
      popupEl.style.top = Math.round(win.y - 24) + "px";
    });

    let panEase = 0;
    let panNorth = 0;
    let panEast = 0;
    let zoomEase = 0;
    let zoomSign = 0;
    const panScale = 1.1;
    const zoomScale = 0.18;
    installKeys((down, dt, boost) => {
      const cam = viewer.camera;
      const carto = cam.positionCartographic;
      const heading = cam.heading;
      let north = 0;
      let east = 0;
      if (down.has("w")) {
        north += Math.cos(heading);
        east += Math.sin(heading);
      }
      if (down.has("s")) {
        north -= Math.cos(heading);
        east -= Math.sin(heading);
      }
      if (down.has("d")) {
        north -= Math.sin(heading);
        east += Math.cos(heading);
      }
      if (down.has("a")) {
        north += Math.sin(heading);
        east -= Math.cos(heading);
      }
      const pressingPan = north !== 0 || east !== 0;
      if (pressingPan) {
        const len = Math.hypot(north, east) || 1;
        panNorth = north / len;
        panEast = east / len;
      }
      panEase = approach(panEase, pressingPan ? 1 : 0, dt, pressingPan ? 0.45 : 0.7);
      let zoomDir = 0;
      if (down.has("q")) zoomDir += 1;
      if (down.has("e")) zoomDir -= 1;
      if (zoomDir) zoomSign = Math.sign(zoomDir);
      zoomEase = approach(zoomEase, zoomDir ? 1 : 0, dt, zoomDir ? 0.4 : 0.65);
      const panGain = smoothstep(panEase) * panScale * boost;
      const zoomGain = smoothstep(zoomEase) * zoomScale * boost;
      if (panGain > 0.0008) {
        const meters = Math.max(carto.height * 0.22, 80) * dt * panGain;
        const lat = carto.latitude + (panNorth * meters) / 6378137;
        const lon =
          carto.longitude +
          (panEast * meters) / (6378137 * Math.max(0.2, Math.cos(carto.latitude)));
        cam.setView({
          destination: Cesium.Cartesian3.fromRadians(lon, lat, carto.height),
          orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 },
        });
      }
      if (zoomGain > 0.0008 && zoomSign) {
        const step = Math.max(carto.height * 0.35, 40) * dt * zoomGain;
        if (zoomSign > 0) cam.zoomIn(step);
        else cam.zoomOut(step);
      }
    });

    return {
      kind: "cesium",
      setDrag(on) {
        ctrl.enableInputs = on;
      },
      setPolitical() {},
      setMotion() {},
      setPlaceLang() {},
      hits(places, x1, y1, x2, y2) {
        occluder.cameraPosition = viewer.camera.position;
        return screenHits(
          places,
          (p) => {
            const c = Cesium.Cartesian3.fromDegrees(p.lon, p.lat);
            if (!occluder.isPointVisible(c)) return null;
            return Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, c);
          },
          x1,
          y1,
          x2,
          y2
        );
      },
      refresh(places, colorOf) {
        pins.removeAll();
        for (let i = 0; i < places.length; i++) {
          const p = places[i];
          pins.add({
            id: p.id,
            position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat),
            image: canvasFor(colorOf(p)),
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: clamp,
            scale: 0.5,
          });
        }
      },
      flyTo(p) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 7000),
          orientation: {
            heading: viewer.camera.heading,
            pitch: Cesium.Math.toRadians(-42),
            roll: 0,
          },
          duration: 1.15,
        });
      },
      fit(list) {
        if (!list.length) return;
        if (list.length === 1) {
          this.flyTo(list[0]);
          return;
        }
        let west = 180;
        let south = 90;
        let east = -180;
        let north = -90;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          west = Math.min(west, p.lon);
          east = Math.max(east, p.lon);
          south = Math.min(south, p.lat);
          north = Math.max(north, p.lat);
        }
        if (east - west > 200) {
          west = -180;
          east = 180;
        }
        viewer.camera.flyTo({
          destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
          duration: 1.15,
        });
      },
      showPopup(p, html) {
        popupPlace = p;
        if (!popupEl) return;
        popupEl.innerHTML = html;
        popupEl.hidden = false;
      },
    };
  }

  window.msfsEarthStyle = function (lang) {
    return earthStyle(false, lang);
  };
  window.msfsEfbStyle = function (lang) {
    return earthStyle(true, lang);
  };
  window.createMsfsMap = function (opts) {
    if (opts.googleKey && window.Cesium) return createCesium(opts);
    return createMapLibre(opts);
  };
})();
