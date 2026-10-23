/* Laminated Glasses — konstruktor uchun 3D shisha simulyatori.

   constructor.html ichidagi "Ko'rinish (preview)" paneli shu modul orqali
   rasmni haqiqiy 3D shisha panellar ko'rinishida chizadi:
     - har bir panelning eni/bo'yi admin belgilagan o'lchamdan (sm) olinadi
       va sahnada AYNAN shu nisbatda quriladi (foydalanuvchi o'zgartira olmaydi);
     - 3 qatlam (orqadan oldinga): rasm (orqasi oq), PVB kley, oyna (1,5 mm);
     - 360° erkin aylantirish (sichqoncha/barmoq, inersiya bilan);
     - qizdirishdan oldin rasm PVB ortida xira (blur), qizdirilgach tiniq va yorqin;
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

  /* Qatlam qalinliklari (sm). Oyna 1,5 mm; qog'oz (rasm) + PVB kley birgalikda 2 mm gacha.
     Tartib (orqadan oldinga): 0 rasm (orqasi oq), 1 PVB kley, 2 oyna. */
  var THICK = [0.05, 0.15, 0.15];
  var BASE_Z = [];
  (function () {
    var total = THICK.reduce(function (a, b) { return a + b; }, 0);
    var z = -total / 2;
    for (var i = 0; i < THICK.length; i++) { BASE_Z[i] = z + THICK[i] / 2; z += THICK[i]; }
  })();
  var LOOSE_GAP = 0.07;     // qizdirishdan oldin qatlamlar orasidagi mayda tirqish
  var LAYER_NAMES = ['Rasm (orqasi oq)', 'PVB kley', 'Oyna'];
  var TAU = Math.PI * 2;
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
    scene.add(new T.HemisphereLight(0xffffff, 0x9fb4c6, 0.55));
    var key = new T.DirectionalLight(0xffffff, 0.5);
    key.position.set(-120, 160, 220);
    scene.add(key);

    var envTex = null;
    (function makeEnv() {
      try {
        var c = document.createElement('canvas'); c.width = 512; c.height = 256;
        var g = c.getContext('2d');
        var gr = g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#dfe8ee'); gr.addColorStop(0.42, '#b4c4d1');
        gr.addColorStop(0.5, '#7d8f9d'); gr.addColorStop(1, '#27333d');
        g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
        g.fillStyle = 'rgba(255,255,255,0.6)';
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
    var white = new T.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.92, metalness: 0 });
    // Rasm: avval xira (blur) nusxa, qizdirilganda ustidagi tiniq nusxa ko'rinib boradi
    var printBlurMat = new T.MeshBasicMaterial({ color: 0xcccccc });
    var printSharpMat = new T.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0, depthWrite: false });
    var pvbMat = new T.MeshPhysicalMaterial({
      color: 0xf0f3f6, roughness: 0.8, metalness: 0, transparent: true, opacity: 0.42,
      depthWrite: false, envMap: envTex, envMapIntensity: 0.25
    });
    var glassFaceMat = new T.MeshPhysicalMaterial({
      color: 0xe3f1ef, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.07,
      depthWrite: false, envMap: envTex, envMapIntensity: 0.7, clearcoat: 0.6, clearcoatRoughness: 0.05
    });
    var glassEdgeMat = new T.MeshPhysicalMaterial({
      color: 0x7fbfb4, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.7,
      depthWrite: false, envMap: envTex, envMapIntensity: 0.7
    });
    var glowMat = new T.MeshBasicMaterial({
      color: 0xff5a14, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false
    });
    var edgeLineMat = new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });

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
      band(90, 46, 0.35); band(190, 16, 0.2);
      sheenTex = new T.CanvasTexture(c);
      sheenTex.wrapS = sheenTex.wrapT = T.RepeatWrapping;
    })();
    var sheenMat = new T.MeshBasicMaterial({
      map: sheenTex, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false
    });

    var printTex = null, blurTex = null, blurCanvas = null, srcCanvas = null;
    var shadowMesh = null, shadowTex = null;

    /* ---------- Holat ---------- */
    var panes = [];                 // [{w,h,index}]
    var meshes = [];                // har bir panel uchun { layers: [3 qatlam], ... }
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
        function sliceUV(geo, from, to) {
          var uv = geo.attributes.uv;
          for (var k = from; k < to; k++) uv.setXY(k, lerp(u0, u1, uv.getX(k)), lerp(v0, v1, uv.getY(k)));
          uv.needsUpdate = true;
        }
        // 0: rasm qatlami — old tomoni xira rasm, orqasi OQ; ustida tiniq nusxa (qizdirilganda ochiladi)
        var printG = new T.Group();
        var pm = makeBox(p.w, p.h, THICK[0], [white, white, white, white, printBlurMat, white]);
        sliceUV(pm.geometry, 16, 20);                 // +z yoq
        printG.add(pm);
        var sharp = new T.Mesh(new T.PlaneGeometry(p.w, p.h), printSharpMat);
        sharp.position.z = THICK[0] / 2 + 0.004;
        sliceUV(sharp.geometry, 0, 4);
        sharp.renderOrder = 1;
        printG.add(sharp);
        layers.push(printG);
        // 1: PVB kley (biroz kichikroq)
        layers.push(makeBox(Math.max(0.1, p.w - 0.2), Math.max(0.1, p.h - 0.2), THICK[1], pvbMat));
        // 2: oyna + akslanish + qizish qatlami
        var glass = new T.Group();
        var gm = makeBox(p.w, p.h, THICK[2], [glassEdgeMat, glassEdgeMat, glassEdgeMat, glassEdgeMat, glassFaceMat, glassFaceMat]);
        glass.add(gm);
        var edges = new T.LineSegments(new T.EdgesGeometry(gm.geometry), edgeLineMat);
        glass.add(edges);
        var front = THICK[2] / 2;
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
        glass.renderOrder = 4; layers[1].renderOrder = 3;
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
        for (var i = 0; i < 3; i++) {
          var z = BASE_Z[i] + (i - 1) * loose + (i - 1) * spread * ex;
          m.layers[i].position.z = z;
        }
      });
      // PVB: qizdirishdan oldin sutdek xira; qizdirilganda erib butunlay tiniq bo'ladi
      pvbMat.opacity = lerp(0.42, 0.03, cure);
      pvbMat.roughness = lerp(0.8, 0.05, cure);
      pvbMat.color.setRGB(0.94 + 0.06 * cure, (0.95 + 0.05 * cure) - 0.45 * glow, (0.96 + 0.04 * cure) - 0.8 * glow);
      // Rasm: oldin biroz xira va xiralashgan, qizdirilgach tiniq va yorqin
      var b = lerp(0.78, 1.0, cure);
      var rr = b, gg = b * (1 - 0.18 * glow), bb = b * (1 - 0.45 * glow);
      printBlurMat.color.setRGB(rr, gg, bb);
      printSharpMat.color.setRGB(rr, gg, bb);
      printSharpMat.opacity = clamp(cure, 0, 1);
      glassFaceMat.opacity = lerp(0.06, 0.1, cure);
      glassFaceMat.envMapIntensity = lerp(0.6, 1.0, cure);
      glowMat.opacity = glow * 0.25;
      sheenMat.opacity = lerp(0.16, 0.3, cure);
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
        if (mode === 'rotate') { camTgt.yaw = frontYaw() - 34 * DEG; camTgt.pitch = 13 * DEG; camTgt.zoom = 1.12; }
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
      updateBlur();
      tween(700, function (p) { cure = lerp(from, 0, easeInOut(p)); applyVisuals(); }, function () {
        cured = false; cure = 0; temp = 22; applyVisuals(); emit();
      });
    }

    function frontYaw() { return Math.round(cam.yaw / TAU) * TAU; }

    function setMode(m) {
      m = m === 'move' ? 'move' : 'rotate';
      if (m === mode) return;
      mode = m;
      canvas.classList.toggle('mode-move', m === 'move');
      if (m === 'move') {
        if (exploded) setExploded(false);
        camTgt.yaw = frontYaw(); camTgt.pitch = 0; camTgt.zoom = 1; spin.yaw = spin.pitch = 0;   // rasmni siljitish uchun to'g'ri ro'para
      }
      dirty = true;
    }

    function resetCamera() {
      var fy = frontYaw();
      spin.yaw = spin.pitch = 0;
      camTgt.yaw = fy; camTgt.pitch = 0; camTgt.zoom = exploded ? 1.12 : 1;
      if (exploded) { camTgt.yaw = fy - 34 * DEG; camTgt.pitch = 13 * DEG; }
      dirty = true;
    }
    function zoomBy(f) { camTgt.zoom = clamp(camTgt.zoom * f, 0.38, 1.8); dirty = true; }

    /* Ro'para tekislikda 1 sm ekrandagi necha piksel (rasmni siljitish uchun) */
    function pxPerCm() {
      placeCamera();
      var zf = BASE_Z[2] + THICK[2] / 2;
      var a = new T.Vector3(0, 0, zf).project(camera), b = new T.Vector3(10, 0, zf).project(camera);
      var w = renderer.domElement.clientWidth || wrap.clientWidth;
      return Math.max(0.001, Math.abs(b.x - a.x) * w / 2 / 10);
    }

    /* ---------- Rasm teksturasi ---------- */
    var canFilter = (function () { try { return 'filter' in CanvasRenderingContext2D.prototype; } catch (e) { return false; } })();
    function updateBlur() {
      if (!srcCanvas) return;
      var m = 420, sc = Math.min(1, m / Math.max(srcCanvas.width, srcCanvas.height));
      var w = Math.max(8, Math.round(srcCanvas.width * sc)), h = Math.max(8, Math.round(srcCanvas.height * sc));
      if (!blurCanvas || blurCanvas.width !== w || blurCanvas.height !== h) {
        blurCanvas = document.createElement('canvas'); blurCanvas.width = w; blurCanvas.height = h;
        if (blurTex) blurTex.dispose();
        blurTex = null;
      }
      var g = blurCanvas.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.clearRect(0, 0, w, h);
      if (canFilter) {
        g.filter = 'blur(' + Math.max(1.5, w / 120).toFixed(1) + 'px)';
        g.drawImage(srcCanvas, 0, 0, w, h);
        g.filter = 'none';
      } else {
        // filter qo'llab-quvvatlanmasa: kichraytirib-kattalashtirish orqali xiralashtiramiz
        var t = document.createElement('canvas'); t.width = Math.max(4, w >> 2); t.height = Math.max(4, h >> 2);
        var tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        tg.drawImage(srcCanvas, 0, 0, t.width, t.height);
        g.drawImage(t, 0, 0, w, h);
      }
      if (!blurTex) {
        blurTex = new T.CanvasTexture(blurCanvas);
        blurTex.encoding = T.sRGBEncoding;
        blurTex.minFilter = T.LinearFilter; blurTex.generateMipmaps = false;
        printBlurMat.map = blurTex; printBlurMat.needsUpdate = true;
      } else blurTex.needsUpdate = true;
    }

    function setPrintCanvas(c) {
      if (printTex) printTex.dispose();
      printTex = null; srcCanvas = c || null;
      if (!c) { printSharpMat.map = null; printBlurMat.map = null; printSharpMat.needsUpdate = true; printBlurMat.needsUpdate = true; return; }
      printTex = new T.CanvasTexture(c);
      printTex.encoding = T.sRGBEncoding;
      printTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      printTex.generateMipmaps = true;
      printTex.minFilter = T.LinearMipmapLinearFilter;
      printSharpMat.map = printTex; printSharpMat.needsUpdate = true;
      updateBlur();
      dirty = true;
    }
    function refreshPrint() {
      if (!printTex) return;
      printTex.needsUpdate = true;
      if (cure < 0.999 || !cured) updateBlur();
      dirty = true;
    }

    /* ---------- Teglar (HTML) ---------- */
    var tmpV = new T.Vector3();
    function project(x, y, z) {
      tmpV.set(x, y, z).applyMatrix4(root.matrixWorld).project(camera);
      var w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
      return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h, z: tmpV.z };
    }
    function updateLabels() {
      if (!labelsEl || !meshes.length) return;
      var zf = BASE_Z[2] + THICK[2] / 2 + 0.1;
      var facing = Math.cos(cam.yaw) * Math.cos(cam.pitch) > 0.25;     // orqa tomondan qaralganda teglar yashiriladi
      var showPane = ex < 0.15 && mode !== 'move' && facing;
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
        if (!fm || ex < 0.6 || !facing) { chip.style.opacity = '0'; return; }
        var z = fm.layers[i].position.z;
        var p = project(fm.x + fm.w / 2, fm.h / 2, z);
        chip.style.opacity = String(clamp((ex - 0.6) / 0.4, 0, 1));
        chip.style.transform = 'translate(8px,-50%) translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      });
    }

    /* ---------- Sichqoncha / barmoq ---------- */
    var pts = new Map(), drag = null, pinch = null;
    var spin = { yaw: 0, pitch: 0 };          // sudrashdan keyingi inersiya (rad/s)
    var PITCH_MAX = 88 * DEG;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* e'tiborsiz */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        spin.yaw = spin.pitch = 0;
        drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
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
        var now = performance.now(), dts = Math.max(0.008, (now - drag.t) / 1000);
        drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
        var dyaw = ddx * 0.5 * DEG, dpitch = ddy * 0.4 * DEG;
        // 360°: yaw cheklanmagan, pitch deyarli to'liq (tepa/past)
        camTgt.yaw += dyaw;
        camTgt.pitch = clamp(camTgt.pitch + dpitch, -PITCH_MAX, PITCH_MAX);
        spin.yaw = lerp(spin.yaw, dyaw / dts, 0.5);
        spin.pitch = lerp(spin.pitch, dpitch / dts, 0.5);
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
        if (mode === 'rotate' && drag && drag.moved && performance.now() - drag.t > 90) { spin.yaw = spin.pitch = 0; }
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
      if (!drag && mode === 'rotate' && (Math.abs(spin.yaw) > 0.02 || Math.abs(spin.pitch) > 0.02)) {
        camTgt.yaw += spin.yaw * dt;
        camTgt.pitch = clamp(camTgt.pitch + spin.pitch * dt, -PITCH_MAX, PITCH_MAX);
        var fr = Math.exp(-dt * 3.2); spin.yaw *= fr; spin.pitch *= fr; dirty = true;
      }
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
