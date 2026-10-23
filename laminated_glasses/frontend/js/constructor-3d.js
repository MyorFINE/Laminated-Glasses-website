/* Laminated Glasses — konstruktor uchun 3D shisha simulyatori.

   constructor.html ichidagi "Ko'rinish (preview)" paneli shu modul orqali
   rasmni haqiqiy 3D shisha panellar ko'rinishida chizadi:
     - har bir panelning eni/bo'yi admin belgilagan o'lchamdan (sm) olinadi
       va sahnada AYNAN shu nisbatda quriladi (foydalanuvchi o'zgartira olmaydi);
     - 4 qatlam: oq taglik, bosma rasm, PVB plyonka, himoya oynasi;
     - "Qatlamlarni ajratish" — qatlamlar bir-biridan ajraladi;
     - "Qizdirish" — pechda PVB erib, qatlamlar biriksishi simulyatsiyasi.

   Modul faqat sahnani biladi; rasm tahriri (kesish, filtr va h.k.) constructor.html'da
   qoladi va tayyor canvas'ni setPrintCanvas() orqali beradi.

   Ishlatish:
     var stage = LGStage3D.create({ wrap, canvas, labels, onState, onImageDrag, onImageZoom, onTap });
     stage.build(panes); stage.setPrintCanvas(canvas); stage.refreshPrint();
*/
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function round1(n) { return Math.round(n * 10) / 10; }

  /* Qatlam qalinliklari (sm) — tasvir uchun haqiqiydan biroz yo'g'onroq.
     Tartib (orqadan oldinga): 0 taglik, 1 bosma, 2 PVB, 3 oyna. */
  var THICK = [0.4, 0.05, 0.2, 0.5];
  var BASE_Z = [];
  (function () {
    var total = THICK.reduce(function (a, b) { return a + b; }, 0);
    var z = -total / 2;
    for (var i = 0; i < THICK.length; i++) { BASE_Z[i] = z + THICK[i] / 2; z += THICK[i]; }
  })();
  var LOOSE_GAP = 0.16;     // qizdirishdan oldin qatlamlar orasidagi mayda tirqish
  var LAYER_NAMES = ['Oq taglik', 'Rasm (bosma)', 'PVB plyonka', 'Himoya oynasi'];
  var HEAT_MS = 6200;

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(global.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function create(opts) {
    var T = global.THREE;
    if (!T || !hasWebGL()) return null;

    var wrap = opts.wrap, canvas = opts.canvas, labelsEl = opts.labels;
    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(30, 1, 1, 6000);
    var root = new T.Group();
    scene.add(root);

    /* ---------- Yorug'lik va aks-sado muhiti ---------- */
    scene.add(new T.HemisphereLight(0xffffff, 0x9fb4c6, 0.9));
    var key = new T.DirectionalLight(0xffffff, 0.9);
    key.position.set(-120, 160, 220);
    scene.add(key);

    var envTex = null;
    (function makeEnv() {
      try {
        var c = document.createElement('canvas'); c.width = 512; c.height = 256;
        var g = c.getContext('2d');
        var gr = g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.42, '#d6e7f4');
        gr.addColorStop(0.5, '#93a8b9'); gr.addColorStop(1, '#2b3a47');
        g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
        g.fillStyle = 'rgba(255,255,255,0.96)';
        g.fillRect(70, 46, 96, 64); g.fillRect(330, 38, 120, 56); g.fillRect(210, 14, 70, 26);
        var tex = new T.CanvasTexture(c);
        tex.mapping = T.EquirectangularReflectionMapping;
        tex.encoding = T.sRGBEncoding;
        var pm = new T.PMREMGenerator(renderer);
        envTex = pm.fromEquirectangular(tex).texture;
        pm.dispose(); tex.dispose();
      } catch (e) { envTex = null; }
    })();

    /* ---------- Umumiy materiallar ---------- */
    var white = new T.MeshStandardMaterial({ color: 0xf7f9fb, roughness: 0.9, metalness: 0 });
    var printMat = new T.MeshBasicMaterial({ color: 0xffffff });
    var pvbMat = new T.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.7, metalness: 0, transparent: true, opacity: 0.5,
      depthWrite: false, envMap: envTex, envMapIntensity: 0.6
    });
    var glassFaceMat = new T.MeshPhysicalMaterial({
      color: 0xeaf7f5, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16,
      depthWrite: false, envMap: envTex, envMapIntensity: 1.4, clearcoat: 1, clearcoatRoughness: 0.02
    });
    var glassEdgeMat = new T.MeshPhysicalMaterial({
      color: 0x8fd3c8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.6,
      depthWrite: false, envMap: envTex, envMapIntensity: 1
    });
    var glowMat = new T.MeshBasicMaterial({
      color: 0xff5a14, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false
    });
    var edgeLineMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });

    /* Oyna sirtidagi o'tkir akslanish (burchak o'zgarganda siljiydi) */
    var sheenTex;
    (function () {
      var c = document.createElement('canvas'); c.width = 256; c.height = 256;
      var g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      function band(cx, w, a) {
        var gr = g.createLinearGradient(cx - w, 0, cx + w, 256);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.5, 'rgba(255,255,255,' + a + ')');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      }
      band(90, 46, 0.55); band(190, 16, 0.3);
      sheenTex = new T.CanvasTexture(c);
      sheenTex.wrapS = sheenTex.wrapT = T.RepeatWrapping;
    })();
    var sheenMat = new T.MeshBasicMaterial({
      map: sheenTex, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false
    });

    var printTex = null;
    var shadowMesh = null, shadowTex = null;

    /* ---------- Holat ---------- */
    var panes = [];                 // [{w,h,index}]
    var meshes = [];                // har bir panel uchun { g: [4 qatlam], ... }
    var sumW = 0, maxH = 0, gap = 1.5, totalW = 0;
    var mode = 'rotate';
    var exploded = false, heating = false, cured = false;
    var ex = 0;                     // 0..1 ajralish darajasi
    var cure = 0, glow = 0, temp = 22;
    var spread = 6;                 // ajralganda qatlamlar orasidagi masofa
    var dirty = true, visible = true, disposed = false;

    var cam = { yaw: 0, pitch: 0, zoom: 1 };
    var camTgt = { yaw: 0, pitch: 0, zoom: 1 };
    var camSaved = null;
    var dist0 = 200;

    /* ---------- Tween ---------- */
    var tweens = [];
    function tween(ms, fn, done) {
      var t = { t0: performance.now(), ms: ms, fn: fn, done: done };
      tweens.push(t); dirty = true; return t;
    }
    function stepTweens(now) {
      for (var i = tweens.length - 1; i >= 0; i--) {
        var t = tweens[i];
        var p = clamp((now - t.t0) / t.ms, 0, 1);
        t.fn(p);
        dirty = true;
        if (p >= 1) { tweens.splice(i, 1); if (t.done) t.done(); }
      }
    }

    function emit() {
      if (opts.onState) opts.onState({ exploded: exploded, heating: heating, cured: cured, temp: temp, progress: cure, glow: glow });
    }

    /* ---------- Sahna qurish ---------- */
    function disposeGroup() {
      for (var i = root.children.length - 1; i >= 0; i--) {
        var o = root.children[i];
        root.remove(o);
        o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); });
      }
      meshes = [];
      if (shadowMesh) { shadowMesh = null; }
      if (shadowTex) { shadowTex.dispose(); shadowTex = null; }
      clearLabels();
    }

    function clearLabels() { if (labelsEl) labelsEl.innerHTML = ''; paneChips = []; layerChips = []; }
    var paneChips = [], layerChips = [];

    function makeBox(w, h, d, mats) {
      var geo = new T.BoxGeometry(w, h, d);
      return new T.Mesh(geo, mats);
    }

    function build(list) {
      disposeGroup();
      panes = (list || []).map(function (p, i) { return { index: p.index || i + 1, w: +p.w, h: +p.h }; })
        .filter(function (p) { return p.w > 0 && p.h > 0; });
      if (!panes.length) { sumW = 0; maxH = 0; dirty = true; return; }

      sumW = panes.reduce(function (s, p) { return s + p.w; }, 0);
      maxH = Math.max.apply(null, panes.map(function (p) { return p.h; }));
      var maxDim = Math.max(sumW, maxH);
      gap = clamp(maxDim * 0.015, 0.8, 2);
      totalW = sumW + gap * (panes.length - 1);
      spread = clamp(maxDim * 0.075, 3, 12);

      exploded = false; heating = false; cured = false; ex = 0; cure = 0; glow = 0; temp = 22;
      tweens.length = 0;

      var xCm = 0;            // rasm bo'yicha (oraliqsiz)
      var x = -totalW / 2;    // dunyo bo'yicha (oraliqli)
      panes.forEach(function (p, i) {
        var u0 = xCm / sumW, u1 = (xCm + p.w) / sumW;
        var v0 = (1 - p.h / maxH) / 2, v1 = (1 + p.h / maxH) / 2;
        var cx = x + p.w / 2;
        var g = new T.Group();
        g.position.set(cx, 0, 0);
        root.add(g);

        var layers = [];
        // 0: taglik
        layers.push(makeBox(p.w, p.h, THICK[0], white));
        // 1: bosma (old tomoniga rasm teksturasi)
        var pm = makeBox(p.w, p.h, THICK[1], [white, white, white, white, printMat, white]);
        var uv = pm.geometry.attributes.uv;
        for (var k = 16; k < 20; k++) {            // +z yoq
          uv.setXY(k, lerp(u0, u1, uv.getX(k)), lerp(v0, v1, uv.getY(k)));
        }
        uv.needsUpdate = true;
        layers.push(pm);
        // 2: PVB (biroz kichikroq)
        layers.push(makeBox(Math.max(0.1, p.w - 0.3), Math.max(0.1, p.h - 0.3), THICK[2], pvbMat));
        // 3: oyna + akslanish + qizish qatlami
        var glass = new T.Group();
        var gm = makeBox(p.w, p.h, THICK[3], [glassEdgeMat, glassEdgeMat, glassEdgeMat, glassEdgeMat, glassFaceMat, glassFaceMat]);
        glass.add(gm);
        var edges = new T.LineSegments(new T.EdgesGeometry(gm.geometry), edgeLineMat);
        glass.add(edges);
        var front = THICK[3] / 2;
        var sheen = new T.Mesh(new T.PlaneGeometry(p.w, p.h), sheenMat);
        sheen.position.z = front + 0.02;
        var suv = sheen.geometry.attributes.uv;
        for (var s = 0; s < suv.count; s++) {      // butun jamlanma bo'ylab uzluksiz akslanish
          var wx = cx - p.w / 2 + suv.getX(s) * p.w;
          suv.setXY(s, (wx + totalW / 2) / totalW, (suv.getY(s) * p.h + (maxH - p.h) / 2) / maxH);
        }
        suv.needsUpdate = true;
        glass.add(sheen);
        var glowPlane = new T.Mesh(new T.PlaneGeometry(p.w, p.h), glowMat);
        glowPlane.position.z = front + 0.04;
        glass.add(glowPlane);
        layers.push(glass);

        layers.forEach(function (m) { g.add(m); });
        glass.renderOrder = 4; layers[2].renderOrder = 3;
        meshes.push({ group: g, layers: layers, x: cx, w: p.w, h: p.h });

        xCm += p.w;
        x += p.w + gap;
      });

      buildShadow();
      buildLabels();
      var mid = Math.floor(panes.length / 2);
      focusIdx = mid;
      applyVisuals();
      fit(true);
      emit();
      dirty = true;
    }
    var focusIdx = 0;

    /* Devordagi yumshoq soyalar (oyna devordan ~4 sm uzoqlikda turgandek) */
    function buildShadow() {
      var margin = Math.max(sumW, maxH) * 0.25;
      var W = totalW + margin * 2, H = maxH + margin * 2;
      var ppc = Math.min(6, 1200 / Math.max(W, H));
      var c = document.createElement('canvas');
      c.width = Math.max(8, Math.round(W * ppc)); c.height = Math.max(8, Math.round(H * ppc));
      var g = c.getContext('2d');
      g.fillStyle = '#000';
      function rects(fn) {
        meshes.forEach(function (m) {
          fn((m.x - m.w / 2 + W / 2) * ppc, (H / 2 - m.h / 2) * ppc, m.w * ppc, m.h * ppc);
        });
      }
      g.shadowColor = 'rgba(8,24,40,0.42)';
      g.shadowBlur = Math.max(6, maxH * 0.07 * ppc);
      g.shadowOffsetX = maxH * 0.02 * ppc;
      g.shadowOffsetY = maxH * 0.045 * ppc;
      rects(function (x, y, w, h) { g.fillRect(x, y, w, h); });
      // Panelning o'zi egallagan joyni kesib tashlaymiz — faqat devordagi soya qoladi
      g.shadowColor = 'transparent';
      g.globalCompositeOperation = 'destination-out';
      rects(function (x, y, w, h) { g.fillRect(x - 1, y - 1, w + 2, h + 2); });
      g.globalCompositeOperation = 'source-over';
      shadowTex = new T.CanvasTexture(c);
      var mat = new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 1 });
      var mesh = new T.Mesh(new T.PlaneGeometry(W, H), mat);
      mesh.position.z = -4.5;
      mesh.renderOrder = -1;
      root.add(mesh);
      shadowMesh = mesh;
    }

    function buildLabels() {
      if (!labelsEl) return;
      panes.forEach(function (p) {
        var d = document.createElement('span');
        d.className = 'cv3-chip';
        d.textContent = round1(p.w) + '×' + round1(p.h);
        labelsEl.appendChild(d); paneChips.push(d);
      });
      LAYER_NAMES.forEach(function (n, i) {
        var d = document.createElement('span');
        d.className = 'cv3-layer';
        d.textContent = (i + 1) + '. ' + n;
        labelsEl.appendChild(d); layerChips.push(d);
      });
    }

    /* ---------- Kamera ---------- */
    function fit(resetCam) {
      var w = wrap.clientWidth || 300, h = wrap.clientHeight || 300;
      camera.aspect = w / h;
      var tanH = Math.tan(camera.fov * DEG / 2);
      var pad = 1.22;
      var needH = (maxH * pad / 2) / tanH;
      var needW = (totalW * pad / 2) / (tanH * camera.aspect);
      dist0 = Math.max(needH, needW, 40);
      camera.updateProjectionMatrix();
      if (resetCam) {
        cam.yaw = -26 * DEG; cam.pitch = 8 * DEG; cam.zoom = 1.06;   // kirish animatsiyasi
        camTgt = { yaw: 0, pitch: 0, zoom: 1 };
      }
      dirty = true;
    }

    function placeCamera() {
      var d = dist0 * cam.zoom;
      var cp = Math.cos(cam.pitch);
      camera.position.set(d * Math.sin(cam.yaw) * cp, d * Math.sin(cam.pitch), d * Math.cos(cam.yaw) * cp);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    }

    function resize() {
      var w = Math.max(2, wrap.clientWidth), h = Math.max(2, wrap.clientHeight);
      renderer.setSize(w, h, false);
      if (meshes.length) fit(false); else { camera.aspect = w / h; camera.updateProjectionMatrix(); }
      dirty = true;
    }

    /* ---------- Vizual holatni qo'llash ---------- */
    function applyVisuals() {
      // Qatlamlar o'rni: bog'langan holat + (qizdirishgacha mayda tirqish) + (ajratish)
      var loose = LOOSE_GAP * (1 - cure);
      meshes.forEach(function (m) {
        for (var i = 0; i < 4; i++) {
          var z = BASE_Z[i] + (i - 1.5) * loose + (i - 1.5) * spread * ex;
          m.layers[i].position.z = z;
        }
      });
      // PVB: qizdirilganda erib, tiniq bo'ladi; qizish paytida to'q sariq tovlanadi
      pvbMat.opacity = lerp(0.52, 0.05, cure);
      pvbMat.roughness = lerp(0.7, 0.06, cure);
      pvbMat.color.setRGB(1, 1 - 0.55 * glow, 1 - 0.9 * glow);
      // Bosma rasm: qizdirilgach yorqinroq va tiniqroq ko'rinadi
      var b = lerp(0.9, 1.0, cure);
      printMat.color.setRGB(b, b * (1 - 0.22 * glow), b * (1 - 0.5 * glow));
      glassFaceMat.opacity = lerp(0.15, 0.2, cure);
      glassFaceMat.envMapIntensity = lerp(1.2, 2.0, cure);
      glowMat.opacity = glow * 0.3;
      sheenMat.opacity = lerp(0.42, 0.62, cure);
      if (shadowMesh) shadowMesh.material.opacity = 1 - 0.85 * ex;
      dirty = true;
    }

    /* ---------- Boshqaruv ---------- */
    function setExploded(flag) {
      if (heating || !meshes.length) return;
      flag = !!flag;
      if (flag === exploded) return;
      exploded = flag;
      var from = ex, to = flag ? 1 : 0;
      if (flag) {
        camSaved = { yaw: camTgt.yaw, pitch: camTgt.pitch, zoom: camTgt.zoom };
        if (mode === 'rotate') { camTgt.yaw = -34 * DEG; camTgt.pitch = 13 * DEG; camTgt.zoom = 1.12; }
      } else if (camSaved) {
        camTgt.yaw = camSaved.yaw; camTgt.pitch = camSaved.pitch; camTgt.zoom = camSaved.zoom; camSaved = null;
      }
      tween(900, function (p) { ex = lerp(from, to, easeInOut(p)); applyVisuals(); });
      emit();
    }

    function startHeat() {
      if (heating || cured || !meshes.length) return;
      if (exploded) setExploded(false);
      heating = true; emit();
      tween(HEAT_MS, function (p) {
        var tg, gl;
        if (p < 0.38) { var a = easeInOut(p / 0.38); tg = lerp(22, 140, a); gl = a; }
        else if (p < 0.62) { tg = 140; gl = 1; }
        else { var b = easeInOut((p - 0.62) / 0.38); tg = lerp(140, 28, b); gl = 1 - b; }
        temp = tg; glow = gl;
        cure = easeInOut((p - 0.3) / 0.42);
        applyVisuals(); emit();
      }, function () {
        heating = false; cured = true; temp = 28; glow = 0; cure = 1;
        applyVisuals(); emit();
      });
    }

    function resetHeat() {
      if (heating || !cured) return;
      var from = cure;
      tween(700, function (p) { cure = lerp(from, 0, easeInOut(p)); applyVisuals(); }, function () {
        cured = false; cure = 0; temp = 22; applyVisuals(); emit();
      });
    }

    function setMode(m) {
      m = m === 'move' ? 'move' : 'rotate';
      if (m === mode) return;
      mode = m;
      canvas.classList.toggle('mode-move', m === 'move');
      if (m === 'move') {
        if (exploded) setExploded(false);
        camTgt.yaw = 0; camTgt.pitch = 0; camTgt.zoom = 1;       // rasmni siljitish uchun to'g'ri ro'para
      }
      dirty = true;
    }

    function resetCamera() { camTgt.yaw = 0; camTgt.pitch = 0; camTgt.zoom = exploded ? 1.12 : 1; if (exploded) { camTgt.yaw = -34 * DEG; camTgt.pitch = 13 * DEG; } dirty = true; }
    function zoomBy(f) { camTgt.zoom = clamp(camTgt.zoom * f, 0.38, 1.8); dirty = true; }

    /* Ro'para tekislikda 1 sm ekrandagi necha piksel (rasmni siljitish uchun) */
    function pxPerCm() {
      placeCamera();
      var zf = BASE_Z[3] + THICK[3] / 2;
      var a = new T.Vector3(0, 0, zf).project(camera), b = new T.Vector3(10, 0, zf).project(camera);
      var w = renderer.domElement.clientWidth || wrap.clientWidth;
      return Math.max(0.001, Math.abs(b.x - a.x) * w / 2 / 10);
    }

    /* ---------- Rasm teksturasi ---------- */
    function setPrintCanvas(c) {
      if (printTex) printTex.dispose();
      printTex = null;
      if (!c) { printMat.map = null; printMat.needsUpdate = true; return; }
      printTex = new T.CanvasTexture(c);
      printTex.encoding = T.sRGBEncoding;
      printTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      printTex.generateMipmaps = true;
      printTex.minFilter = T.LinearMipmapLinearFilter;
      printMat.map = printTex; printMat.needsUpdate = true;
      dirty = true;
    }
    function refreshPrint() { if (printTex) { printTex.needsUpdate = true; dirty = true; } }

    /* ---------- Teglar (HTML) ---------- */
    var tmpV = new T.Vector3();
    function project(x, y, z) {
      tmpV.set(x, y, z).applyMatrix4(root.matrixWorld).project(camera);
      var w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
      return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, z: tmpV.z };
    }
    function updateLabels() {
      if (!labelsEl || !meshes.length) return;
      var zf = BASE_Z[3] + THICK[3] / 2 + 0.1;
      var showPane = ex < 0.15 && mode !== 'move';
      meshes.forEach(function (m, i) {
        var chip = paneChips[i]; if (!chip) return;
        var l = project(m.x - m.w / 2, -m.h / 2, zf), r = project(m.x + m.w / 2, -m.h / 2, zf);
        var wpx = Math.abs(r.x - l.x);
        if (!showPane || wpx < 46) { chip.style.opacity = '0'; return; }
        chip.style.opacity = '1';
        chip.style.transform = 'translate(-50%,0) translate(' + ((l.x + r.x) / 2).toFixed(1) + 'px,' + (Math.max(l.y, r.y) + 6).toFixed(1) + 'px)';
      });
      var fm = meshes[focusIdx];
      layerChips.forEach(function (chip, i) {
        if (!fm || ex < 0.6) { chip.style.opacity = '0'; return; }
        var z = fm.layers[i].position.z;
        var p = project(fm.x + fm.w / 2, fm.h / 2, z);
        chip.style.opacity = String(clamp((ex - 0.6) / 0.4, 0, 1));
        chip.style.transform = 'translate(8px,-50%) translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      });
    }

    /* ---------- Sichqoncha / barmoq ---------- */
    var pts = new Map(), drag = null, pinch = null;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* e'tiborsiz */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
        if (mode === 'move' && opts.onImageDrag) opts.onImageDrag({ phase: 'start', dx: 0, dy: 0 });
      } else if (pts.size === 2) {
        var v = Array.from(pts.values());
        pinch = { d: Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1, zoom: camTgt.zoom, last: 1 };
        if (drag) drag.moved = true;
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2 && pinch) {
        var v = Array.from(pts.values());
        var ratio = (Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y) || 1) / pinch.d;
        if (mode === 'move') {
          if (opts.onImageZoom) opts.onImageZoom(ratio / pinch.last);
          pinch.last = ratio;
        } else {
          camTgt.zoom = clamp(pinch.zoom / ratio, 0.38, 1.8);
        }
        dirty = true;
        return;
      }
      if (!drag) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      canvas.classList.add('dragging');
      if (mode === 'move') {
        if (opts.onImageDrag) opts.onImageDrag({ phase: 'move', dx: dx, dy: dy });
      } else {
        var ddx = e.clientX - drag.x, ddy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        camTgt.yaw = clamp(camTgt.yaw + ddx * 0.4 * DEG, -80 * DEG, 80 * DEG);
        camTgt.pitch = clamp(camTgt.pitch + ddy * 0.28 * DEG, -32 * DEG, 38 * DEG);
        dirty = true;
      }
    });
    function endPointer(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        var wasTap = drag && !drag.moved && e.type === 'pointerup';
        if (mode === 'move' && drag && opts.onImageDrag) opts.onImageDrag({ phase: 'end', dx: 0, dy: 0 });
        drag = null;
        canvas.classList.remove('dragging');
        if (wasTap && opts.onTap) opts.onTap();
      }
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('wheel', function (e) {
      if (!meshes.length) return;
      e.preventDefault();
      var up = e.deltaY < 0;
      if (mode === 'move') { if (opts.onImageZoom) opts.onImageZoom(up ? 1.08 : 1 / 1.08); }
      else zoomBy(up ? 0.92 : 1.08);
    }, { passive: false });
    canvas.addEventListener('dblclick', function () { resetCamera(); });

    /* ---------- Chizish sikli ---------- */
    var raf = 0, lastT = performance.now();
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (disposed) return;
      var dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      stepTweens(now);
      var k = 1 - Math.exp(-dt * 9);
      var dy = camTgt.yaw - cam.yaw, dp = camTgt.pitch - cam.pitch, dz = camTgt.zoom - cam.zoom;
      if (Math.abs(dy) > 1e-4 || Math.abs(dp) > 1e-4 || Math.abs(dz) > 1e-4) {
        cam.yaw += dy * k; cam.pitch += dp * k; cam.zoom += dz * k; dirty = true;
      }
      if (!dirty || !visible || !meshes.length) return;
      dirty = false;
      placeCamera();
      root.updateMatrixWorld(true);
      sheenTex.offset.set(-cam.yaw * 0.9 - 0.15, cam.pitch * 0.5);
      renderer.render(scene, camera);
      updateLabels();
    }
    raf = requestAnimationFrame(loop);

    var ro = null;
    if (global.ResizeObserver) { ro = new ResizeObserver(function () { resize(); }); ro.observe(wrap); }
    else global.addEventListener('resize', resize);
    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (en) { visible = !!(en[0] && en[0].isIntersecting); if (visible) dirty = true; });
      io.observe(wrap);
    }
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', function () { dirty = true; });
    resize();

    return {
      build: build,
      setPrintCanvas: setPrintCanvas,
      refreshPrint: refreshPrint,
      setMode: setMode,
      getMode: function () { return mode; },
      toggleExplode: function () { setExploded(!exploded); },
      isExploded: function () { return exploded; },
      startHeat: startHeat,
      resetHeat: resetHeat,
      isCured: function () { return cured; },
      isHeating: function () { return heating; },
      resetCamera: resetCamera,
      zoomBy: zoomBy,
      pxPerCm: pxPerCm,
      resize: resize,
      destroy: function () {
        disposed = true; cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); if (io) io.disconnect();
        disposeGroup(); renderer.dispose();
      }
    };
  }

  global.LGStage3D = { create: create, hasWebGL: hasWebGL };
})(window);
