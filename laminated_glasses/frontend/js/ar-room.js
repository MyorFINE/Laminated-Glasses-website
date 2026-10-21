/* Laminated Glasses — "Xonada ko'rish" (AR) moduli.
 *
 * Konstruktordagi tayyor dizayn (rasm + tanlangan o'lcham) xona devorida HAQIQIY
 * o'lchamda ko'rsatiladi.
 *
 *  • Telefon: jonli kamera (orqa kamera) — oyna kamera tasviri ustida turadi.
 *  • Kompyuter: xona rasmi yuklanadi (yoki veb-kamera) — sichqoncha bilan bosilgan
 *    joyga oyna qo'yiladi.
 *
 * Haqiqiy o'lcham qanday aniqlanadi:
 *   Foydalanuvchi kadrdagi o'lchami ma'lum narsani (A4 qog'oz, eshik balandligi yoki
 *   o'zi kiritgan o'lcham) chiziq bilan belgilaydi → 1 sm necha piksel ekani
 *   aniqlanadi. Oyna shu masshtabda chiziladi.
 *
 * Konstruktor bilan aloqa: constructor.html ichidagi window.lgConstructorAR
 *   .isReady()        -> dizayn tayyormi
 *   .buildTexture()   -> { canvas, wCm, hCm, label } (panellar tashqarisi shaffof)
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var S = null;           // holat (overlay ochilganda yaratiladi)
  var root = null;        // overlay elementi
  var canvas, ctx;
  var off = document.createElement('canvas');   // oyna uchun oraliq canvas
  var octx = off.getContext('2d');

  function round1(n) { return Math.round(n * 10) / 10; }
  function toast(msg, isErr) { if (typeof showToast === 'function') showToast(msg, isErr); }
  function isTouchDevice() { return window.matchMedia && window.matchMedia('(pointer:coarse)').matches; }

  /* ---------------------------------------------------------------- DOM */
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'ar-overlay';
    root.id = 'arOverlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', "Xonada ko'rish");
    root.hidden = true;
    root.innerHTML =
      '<div class="ar-top">' +
        '<div class="ar-title"><strong>Xonada ko\'rish</strong><span id="arSizeInfo"></span></div>' +
        '<button type="button" class="ar-close" id="arClose" aria-label="Yopish">✕</button>' +
      '</div>' +
      '<div class="ar-stagebox" id="arStageBox">' +
        '<canvas id="arCanvas"></canvas>' +
        '<div class="ar-start" id="arStart">' +
          '<div class="ar-start-card">' +
            '<h3>Oynani xonangizda ko\'ring</h3>' +
            '<p>Oyna devorda turgandek, <b>haqiqiy o\'lchamda</b> ko\'rinadi.</p>' +
            '<button type="button" class="ar-btn ar-btn-main" id="arBtnCamera">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
              'Jonli kamera' +
            '</button>' +
            '<button type="button" class="ar-btn" id="arBtnPhoto">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' +
              '<span id="arBtnPhotoText">Xona rasmini tanlash</span>' +
            '</button>' +
            '<div class="ar-start-err" id="arStartErr" role="alert"></div>' +
          '</div>' +
        '</div>' +
        '<div class="ar-hint" id="arHint" hidden></div>' +
      '</div>' +
      '<div class="ar-panel" id="arPanel" hidden>' +
        /* 1-qadam: o'lchash */
        '<div class="ar-step" id="arStepCalib" hidden>' +
          '<div class="ar-step-title">1. Masshtabni belgilang</div>' +
          '<div class="ar-ref-row">' +
            '<select id="arRefSelect" aria-label="Etalon">' +
              '<option value="29.7">A4 qog\'oz — uzun tomoni (29.7 sm)</option>' +
              '<option value="21">A4 qog\'oz — qisqa tomoni (21 sm)</option>' +
              '<option value="200">Eshik balandligi (200 sm)</option>' +
              '<option value="custom">Boshqa o\'lcham…</option>' +
            '</select>' +
            '<label class="ar-cm"><input type="number" id="arRefCm" min="1" max="1000" step="0.1" value="29.7" inputmode="decimal"><span>sm</span></label>' +
          '</div>' +
          '<p class="ar-note" id="arCalibNote"></p>' +
          '<div class="ar-actions">' +
            '<button type="button" class="ar-btn" id="arBack">Orqaga</button>' +
            '<button type="button" class="ar-btn ar-btn-main" id="arCalibOk">Davom etish</button>' +
          '</div>' +
        '</div>' +
        /* 2-qadam: joylashtirish */
        '<div class="ar-step" id="arStepPlace" hidden>' +
          '<div class="ar-sliders">' +
            '<label>Burilish <output id="arRotOut">0°</output><input type="range" id="arRot" min="-15" max="15" step="0.5" value="0"></label>' +
            '<label>Masshtab <output id="arScaleOut">100%</output><input type="range" id="arScale" min="50" max="130" step="1" value="100"></label>' +
            '<label>Yon perspektiva <output id="arYawOut">0°</output><input type="range" id="arYaw" min="-45" max="45" step="1" value="0"></label>' +
            '<label>Yuqori / past <output id="arPitchOut">0°</output><input type="range" id="arPitch" min="-30" max="30" step="1" value="0"></label>' +
            '<label>Yorug\'lik <output id="arLightOut">100%</output><input type="range" id="arLight" min="55" max="100" step="1" value="100"></label>' +
          '</div>' +
          '<div class="ar-actions ar-actions-wrap">' +
            '<label class="ar-check"><input type="checkbox" id="arShowDim" checked> O\'lchamni ko\'rsatish</label>' +
            '<button type="button" class="ar-btn" id="arRecalib">Aniq o\'lchash</button>' +
            '<button type="button" class="ar-btn ar-btn-main" id="arSave">Rasmni saqlash</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<input type="file" id="arFile" accept="image/*" hidden>' +
      '<video id="arVideo" class="ar-video" playsinline muted autoplay></video>';
    document.body.appendChild(root);

    canvas = $('arCanvas');
    ctx = canvas.getContext('2d');
    bind();
  }

  /* ------------------------------------------------------------ holat */
  function freshState() {
    return {
      src: null,            // 'video' | 'photo'
      stream: null, video: null, photo: null, bg: null,
      mode: 'start',        // 'start' | 'calib' | 'place'
      cw: 0, ch: 0, dpr: 1,
      calib: { a: { x: 0.30, y: 0.5 }, b: { x: 0.70, y: 0.5 }, cm: 29.7 },
      k: 0,                 // 1 sm = k * canvas eni (piksel)
      pos: { x: 0.5, y: 0.5 },
      rot: 0, yaw: 0, pitch: 0, light: 100, showDim: true, scaleMul: 1,
      tex: null, quad: null,
      drag: null, raf: 0, loop: 0, opening: false,
    };
  }

  /* ------------------------------------------------------- ochish/yopish */
  async function open() {
    var br = window.lgConstructorAR;
    if (!br || !br.isReady()) { toast("Avval o'lcham tanlang va rasm yuklang.", true); return; }
    build();
    stopStream();
    S = freshState();
    var tex = await br.buildTexture();
    if (!tex) { toast("Dizaynni tayyorlab bo'lmadi.", true); return; }
    S.tex = tex;

    $('arSizeInfo').textContent = tex.label + ' • ' + round1(tex.wCm) + ' × ' + round1(tex.hCm) + ' sm';
    $('arBtnPhotoText').textContent = isTouchDevice() ? 'Suratga olish / galereya' : 'Xona rasmini tanlash';
    $('arStartErr').textContent = '';
    setMode('start');

    root.hidden = false;
    document.body.classList.add('ar-lock');
    requestAnimationFrame(function () { root.classList.add('open'); layoutStage(); });

    // Telefonda tugma bosilishining o'zi ruxsat so'rash uchun yetarli — kamerani darrov yoqamiz.
    if (isTouchDevice() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) startCamera();
  }

  function close() {
    if (!root || root.hidden) return;
    stopStream();
    cancelAnimationFrame(S && S.raf); if (S) S.raf = 0;
    root.classList.remove('open');
    root.hidden = true;
    document.body.classList.remove('ar-lock');
    S = null;
  }

  /* ---------------------------------------------------------- manba: kamera */
  function stopStream() {
    if (S && S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    var v = $('arVideo'); if (v) { try { v.pause(); } catch (e) {} v.srcObject = null; }
    if (S) { S.loop = 0; }
  }

  async function startCamera() {
    var err = $('arStartErr');
    err.textContent = '';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      err.textContent = "Bu brauzerda jonli kamera ishlamaydi (sayt HTTPS orqali ochilishi kerak). \"Xona rasmini tanlash\" tugmasidan foydalaning.";
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!S) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      S.stream = stream;
      var v = $('arVideo');
      v.srcObject = stream;
      v.muted = true; v.setAttribute('playsinline', '');
      await v.play();
      S.src = 'video'; S.video = v; S.photo = null; S.bg = null;
      layoutStage();
      autoPlace();
      startLoop();
    } catch (e) {
      var name = e && e.name;
      err.textContent = (name === 'NotAllowedError' || name === 'SecurityError')
        ? "Kameraga ruxsat berilmadi. Brauzer sozlamalaridan ruxsat bering yoki xona rasmini tanlang."
        : (name === 'NotFoundError' || name === 'OverconstrainedError')
          ? "Kamera topilmadi. Xona rasmini tanlab ko'ring."
          : "Kamerani ochib bo'lmadi. Xona rasmini tanlab ko'ring.";
    }
  }

  /* ---------------------------------------------------------- manba: rasm */
  function loadPhoto(file) {
    var err = $('arStartErr');
    err.textContent = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { err.textContent = 'Faqat rasm fayli tanlang (JPG, PNG, WEBP).'; return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      if (!S) return;
      stopStream();
      S.src = 'photo'; S.photo = img; S.video = null;
      layoutStage();
      autoPlace();
    };
    img.onerror = function () { URL.revokeObjectURL(url); err.textContent = "Rasmni ochib bo'lmadi. Boshqa rasm tanlang."; };
    img.src = url;
  }

  /* -------------------------------------------------------- bosqichlar */
  function setMode(m) {
    S.mode = m;
    $('arStart').hidden = (m !== 'start');
    $('arPanel').hidden = (m === 'start');
    $('arStepCalib').hidden = (m !== 'calib');
    $('arStepPlace').hidden = (m !== 'place');
    var hint = $('arHint');
    if (m === 'calib') {
      hint.hidden = false;
      hint.textContent = "Ixtiyoriy: chiziq uchlarini o'lchami ma'lum narsaning ikki chetiga suring.";
      $('arCalibNote').textContent = S.src === 'video'
        ? "Devorga A4 qog'oz (yoki o'lchami ma'lum narsa) tuting. Chiziq uchlarini uning chetlariga moslang. Keyin telefonni shu masofada ushlab turing."
        : "Rasmdagi o'lchami ma'lum narsaning (A4 qog'oz, eshik va h.k.) ikki chetini chiziq uchlari bilan belgilang, o'lchamini kiriting.";
    } else if (m === 'place') {
      hint.hidden = false;
      hint.textContent = S.src === 'video'
        ? "Oyna avtomatik qo'yildi. Devordagi kerakli joyga barmoq bilan suring."
        : "Oyna avtomatik qo'yildi. Qo'ymoqchi bo'lgan joyni bosing — oyna o'sha yerga o'tadi.";
    } else {
      hint.hidden = true;
    }
    requestRender();
  }

  /* Avtomatik joylashtirish: etalon talab qilinmaydi.
     Kamera: telefon kamerasining odatiy ko'rish burchagi va devordan ~2 m masofa taxmin qilinadi.
     Rasm: xona rasmi balandligi ~2.6 m (odatiy shift balandligi) deb olinadi.
     Oyna hech qachon kadrning ~65% idan kattalashmaydi. Aniqroq bo'lishi uchun
     "Aniq o'lchash" (ixtiyoriy) va "Masshtab" slayderi bor. */
  function autoPlace() {
    var T = S.tex, ppc;
    if (S.src === 'video') {
      var fov = (S.ch > S.cw ? 52 : 65) * Math.PI / 180;          // gorizontal ko'rish burchagi
      var visibleW = 2 * 200 * Math.tan(fov / 2);                  // 2 m masofadagi kadr eni (sm)
      ppc = S.cw / visibleW;
    } else {
      ppc = S.ch / 260;
    }
    var f = Math.min(1, 0.65 * S.cw / (T.wCm * ppc), 0.65 * S.ch / (T.hCm * ppc));
    ppc *= f;
    S.k = ppc / S.cw;
    S.scaleMul = 1;
    S.pos = { x: 0.5, y: 0.45 };
    S.rot = 0; S.yaw = 0; S.pitch = 0; S.light = 100;
    ['arRot','arYaw','arPitch'].forEach(function (id) { $(id).value = 0; });
    $('arLight').value = 100; $('arScale').value = 100;
    $('arRotOut').textContent = '0°'; $('arYawOut').textContent = '0°'; $('arPitchOut').textContent = '0°';
    $('arLightOut').textContent = '100%'; $('arScaleOut').textContent = '100%';
    setMode('place');
  }

  function enterCalib() {
    // chiziqni o'rtaga qaytaramiz
    S.calib.a = { x: 0.30, y: 0.5 }; S.calib.b = { x: 0.70, y: 0.5 };
    setMode('calib');
  }

  function confirmCalib() {
    var A = toPx(S.calib.a), B = toPx(S.calib.b);
    var len = Math.hypot(B.x - A.x, B.y - A.y);
    var cm = Number($('arRefCm').value);
    if (!(cm > 0)) { toast("Etalon o'lchamini (sm) kiriting.", true); return; }
    if (len < 24) { toast("Chiziq juda qisqa — uchlarini etalonning chetlariga suring.", true); return; }
    S.calib.cm = cm;
    S.k = (len / cm) / S.cw;               // 1 sm = k * canvas eni
    S.pos = { x: 0.5, y: 0.5 };
    S.scaleMul = 1; $('arScale').value = 100; $('arScaleOut').textContent = '100%';
    var ppc = S.k * S.cw;
    var gw = S.tex.wCm * ppc;
    setMode('place');
    if (gw > S.cw * 1.05) {
      $('arHint').textContent = "Oyna kadrdan katta ko'rinyapti. Telefonni devordan uzoqroq tutib qayta o'lchang.";
    }
  }

  /* -------------------------------------------------------------- canvas */
  function boxSize() {
    var b = $('arStageBox');
    return { w: Math.max(120, b.clientWidth), h: Math.max(120, b.clientHeight) };
  }

  function layoutStage() {
    if (!S || !canvas) return;
    var box = boxSize();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = box.w, h = box.h;
    if (S.src === 'photo' && S.photo) {
      var sc = Math.min(box.w / S.photo.naturalWidth, box.h / S.photo.naturalHeight);
      w = Math.max(80, Math.round(S.photo.naturalWidth * sc));
      h = Math.max(80, Math.round(S.photo.naturalHeight * sc));
    }
    S.cw = w; S.ch = h; S.dpr = dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);

    if (S.src === 'photo' && S.photo) {      // fonni bir marta tayyor qilib qo'yamiz (tez chizish uchun)
      var bg = document.createElement('canvas');
      bg.width = canvas.width; bg.height = canvas.height;
      var bctx = bg.getContext('2d');
      bctx.imageSmoothingQuality = 'high';
      bctx.drawImage(S.photo, 0, 0, bg.width, bg.height);
      S.bg = bg;
    }
    requestRender();
  }

  function toPx(n) { return { x: n.x * S.cw, y: n.y * S.ch }; }

  function requestRender() {
    if (!S || S.src === 'video' && S.loop) return;   // video bo'lsa halqa o'zi chizadi
    if (S.raf) return;
    S.raf = requestAnimationFrame(function () { if (S) { S.raf = 0; render(); } });
  }

  function startLoop() {
    if (!S || S.loop) return;
    S.loop = 1;
    (function tick() {
      if (!S || !S.loop) return;
      render();
      requestAnimationFrame(tick);
    })();
  }

  function drawBackground() {
    var W = S.cw, H = S.ch;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = '#0b1c2a';
    ctx.fillRect(0, 0, W, H);
    if (S.src === 'video' && S.video && S.video.videoWidth) {
      var vw = S.video.videoWidth, vh = S.video.videoHeight;
      var sc = Math.max(W / vw, H / vh);          // "cover"
      var dw = vw * sc, dh = vh * sc;
      ctx.drawImage(S.video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else if (S.src === 'photo' && S.bg) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(S.bg, 0, 0);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    }
  }

  function render() {
    if (!S || !ctx || !S.cw) return;
    drawBackground();
    if (S.mode === 'calib') drawCalib();
    else if (S.mode === 'place') drawGlass(ctx, true);
  }

  /* ----------------------------------------------------- o'lchash chizig'i */
  function drawCalib() {
    var A = toPx(S.calib.a), B = toPx(S.calib.b);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    [A, B].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd24a'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
    var cm = Number($('arRefCm').value) || 0;
    var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    pill(ctx, (cm ? round1(cm) : '?') + ' sm', mx, my - 26);
    ctx.restore();
  }

  function pill(c, text, x, y) {
    c.save();
    c.font = '700 13px Manrope, system-ui, sans-serif';
    var tw = c.measureText(text).width + 18;
    var px = Math.max(tw / 2 + 4, Math.min(S.cw - tw / 2 - 4, x));
    var py = Math.max(16, Math.min(S.ch - 16, y));
    c.fillStyle = 'rgba(6,28,44,.82)';
    var r = 12, x0 = px - tw / 2, y0 = py - 12, h = 24;
    c.beginPath();
    c.moveTo(x0 + r, y0); c.arcTo(x0 + tw, y0, x0 + tw, y0 + h, r); c.arcTo(x0 + tw, y0 + h, x0, y0 + h, r);
    c.arcTo(x0, y0 + h, x0, y0, r); c.arcTo(x0, y0, x0 + tw, y0, r); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, px, py + 1);
    c.restore();
  }

  /* ------------------------------------------------------------ oyna chizish */
  /* To'rtburchakning (u,v ∈ [0..1]) ekrandagi nuqtasi: yon/yuqori burilish (perspektiva),
     tekislikdagi burilish. Markazda (z=0) masshtab o'zgarmaydi → o'lcham haqiqiyligicha qoladi. */
  function makeProjector(cx, cy, W, H, rotDeg, yawDeg, pitchDeg) {
    var a = yawDeg * Math.PI / 180, b = pitchDeg * Math.PI / 180, r = rotDeg * Math.PI / 180;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cr = Math.cos(r), sr = Math.sin(r);
    var f = Math.max(W, H) * 2.5;
    return function (u, v) {
      var x = (u - 0.5) * W, y = (v - 0.5) * H;
      var x1 = x * ca, z1 = -x * sa;
      var y2 = y * cb - z1 * sb, z2 = y * sb + z1 * cb;
      var xr = x1 * cr - y2 * sr, yr = x1 * sr + y2 * cr;
      var s = f / (f + z2);
      return [cx + xr * s, cy + yr * s];
    };
  }

  function drawTri(c, img, s0, s1, s2, d0, d1, d2) {
    // choksiz birikishi uchun uchburchakni biroz kengaytiramiz
    var gx = (d0[0] + d1[0] + d2[0]) / 3, gy = (d0[1] + d1[1] + d2[1]) / 3;
    function grow(p) { var dx = p[0] - gx, dy = p[1] - gy, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.7, p[1] + dy / l * 0.7]; }
    var e0 = grow(d0), e1 = grow(d1), e2 = grow(d2);
    c.save();
    c.beginPath(); c.moveTo(e0[0], e0[1]); c.lineTo(e1[0], e1[1]); c.lineTo(e2[0], e2[1]); c.closePath(); c.clip();
    var x0 = s0[0], y0 = s0[1];
    var det = (s1[0] - x0) * (s2[1] - y0) - (s2[0] - x0) * (s1[1] - y0);
    if (Math.abs(det) > 1e-9) {
      var du1 = d1[0] - d0[0], du2 = d2[0] - d0[0], dv1 = d1[1] - d0[1], dv2 = d2[1] - d0[1];
      var a = (du1 * (s2[1] - y0) - du2 * (s1[1] - y0)) / det;
      var cc = (du2 * (s1[0] - x0) - du1 * (s2[0] - x0)) / det;
      var b = (dv1 * (s2[1] - y0) - dv2 * (s1[1] - y0)) / det;
      var d = (dv2 * (s1[0] - x0) - dv1 * (s2[0] - x0)) / det;
      c.transform(a, b, cc, d, d0[0] - a * x0 - cc * y0, d0[1] - b * x0 - d * y0);
      c.drawImage(img, 0, 0);
    }
    c.restore();
  }

  function drawGlass(target, withLabel) {
    var T = S.tex; if (!T) return;
    var ppc = S.k * S.cw * S.scaleMul;
    var W = T.wCm * ppc, H = T.hCm * ppc;
    if (!(W > 1 && H > 1)) return;
    var cx = S.pos.x * S.cw, cy = S.pos.y * S.ch;
    var P = makeProjector(cx, cy, W, H, S.rot, S.yaw, S.pitch);
    var q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    S.quad = q;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    q.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var blur = Math.min(36, Math.max(8, Math.min(W, H) * 0.06));
    var pad = Math.ceil(blur * 2.2);
    var bx = Math.floor(minX - pad), by = Math.floor(minY - pad);
    var bw = Math.ceil(maxX - minX + pad * 2), bh = Math.ceil(maxY - minY + pad * 2);
    bw = Math.min(bw, 6000); bh = Math.min(bh, 6000);

    var dpr = S.dpr;
    var ow = Math.max(1, Math.round(bw * dpr)), oh = Math.max(1, Math.round(bh * dpr));
    if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, off.width, off.height);
    octx.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';

    var tc = T.canvas;
    if (!S.yaw && !S.pitch) {
      octx.save();
      octx.translate(cx, cy); octx.rotate(S.rot * Math.PI / 180);
      octx.drawImage(tc, -W / 2, -H / 2, W, H);
      octx.restore();
    } else {
      var N = 14, tw = tc.width, th = tc.height, g = [], i, j;
      for (j = 0; j <= N; j++) { g[j] = []; for (i = 0; i <= N; i++) g[j][i] = { d: P(i / N, j / N), s: [i / N * tw, j / N * th] }; }
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var p00 = g[j][i], p10 = g[j][i + 1], p11 = g[j + 1][i + 1], p01 = g[j + 1][i];
        drawTri(octx, tc, p00.s, p10.s, p11.s, p00.d, p10.d, p11.d);
        drawTri(octx, tc, p00.s, p11.s, p01.s, p00.d, p11.d, p01.d);
      }
    }

    // Shisha porlashi va xona yorug'ligiga moslash — faqat oyna piksellariga ('source-atop')
    octx.globalCompositeOperation = 'source-atop';
    var gr = octx.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.38, 'rgba(255,255,255,0.00)');
    gr.addColorStop(0.52, 'rgba(255,255,255,0.20)');
    gr.addColorStop(0.64, 'rgba(255,255,255,0.00)');
    gr.addColorStop(1, 'rgba(255,255,255,0.06)');
    octx.fillStyle = gr; octx.fillRect(bx, by, bw, bh);
    if (S.light < 100) { octx.fillStyle = 'rgba(0,0,0,' + ((100 - S.light) / 100 * 0.75).toFixed(3) + ')'; octx.fillRect(bx, by, bw, bh); }
    octx.globalCompositeOperation = 'source-over';

    // Asosiy canvasga soya bilan
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.shadowColor = 'rgba(0,0,0,0.38)';
    target.shadowBlur = blur * dpr;
    target.shadowOffsetX = blur * 0.22 * dpr;
    target.shadowOffsetY = blur * 0.45 * dpr;
    target.drawImage(off, bx * dpr, by * dpr, bw * dpr, bh * dpr);
    target.restore();

    if (withLabel && S.showDim) {
      target.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      pill(target, round1(T.wCm) + ' × ' + round1(T.hCm) + ' sm', cx, maxY + 18);
    }
  }

  function pointInQuad(p) {
    var q = S.quad; if (!q) return false;
    var inside = false;
    for (var i = 0, j = 3; i < 4; j = i++) {
      var xi = q[i][0], yi = q[i][1], xj = q[j][0], yj = q[j][1];
      if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  /* --------------------------------------------------------------- pointer */
  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (S.cw / r.width), y: (e.clientY - r.top) * (S.ch / r.height) };
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function onDown(e) {
    if (!S || S.mode === 'start') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var p = pointer(e);
    if (S.mode === 'calib') {
      var A = toPx(S.calib.a), B = toPx(S.calib.b);
      var dA = Math.hypot(p.x - A.x, p.y - A.y), dB = Math.hypot(p.x - B.x, p.y - B.y);
      if (Math.min(dA, dB) < 46) S.drag = { t: dA <= dB ? 'a' : 'b' };
      else S.drag = { t: 'line', sx: p.x, sy: p.y, a: { x: S.calib.a.x, y: S.calib.a.y }, b: { x: S.calib.b.x, y: S.calib.b.y } };
    } else {
      if (pointInQuad(p)) S.drag = { t: 'move', dx: S.pos.x * S.cw - p.x, dy: S.pos.y * S.ch - p.y };
      else { S.pos.x = clamp01(p.x / S.cw); S.pos.y = clamp01(p.y / S.ch); S.drag = { t: 'move', dx: 0, dy: 0 }; }
    }
    requestRender();
  }

  function onMove(e) {
    if (!S || !S.drag) return;
    var p = pointer(e), d = S.drag;
    if (d.t === 'a' || d.t === 'b') {
      S.calib[d.t] = { x: clamp01(p.x / S.cw), y: clamp01(p.y / S.ch) };
    } else if (d.t === 'line') {
      var dx = (p.x - d.sx) / S.cw, dy = (p.y - d.sy) / S.ch;
      var minDx = -Math.min(d.a.x, d.b.x), maxDx = 1 - Math.max(d.a.x, d.b.x);
      var minDy = -Math.min(d.a.y, d.b.y), maxDy = 1 - Math.max(d.a.y, d.b.y);
      dx = Math.max(minDx, Math.min(maxDx, dx)); dy = Math.max(minDy, Math.min(maxDy, dy));
      S.calib.a = { x: d.a.x + dx, y: d.a.y + dy }; S.calib.b = { x: d.b.x + dx, y: d.b.y + dy };
    } else if (d.t === 'move') {
      S.pos.x = clamp01((p.x + d.dx) / S.cw); S.pos.y = clamp01((p.y + d.dy) / S.ch);
    }
    requestRender();
  }

  function onUp(e) {
    if (!S) return;
    S.drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  /* --------------------------------------------------------------- saqlash */
  async function save() {
    if (!S || S.mode !== 'place') return;
    render();                                   // eng so'nggi kadrni chizamiz
    var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.92); });
    if (!blob) { toast("Rasmni saqlab bo'lmadi.", true); return; }
    var name = 'oyna-xonada-' + new Date().toISOString().slice(0, 10) + '.jpg';
    try {
      var file = new File([blob], name, { type: 'image/jpeg' });
      if (isTouchDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Oyna xonamda" });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Rasm yuklab olindi.');
  }

  /* ---------------------------------------------------------------- tadbirlar */
  function bind() {
    $('arClose').addEventListener('click', close);
    $('arBtnCamera').addEventListener('click', startCamera);
    $('arBtnPhoto').addEventListener('click', function () { $('arFile').value = ''; $('arFile').click(); });
    $('arFile').addEventListener('change', function (e) { loadPhoto(e.target.files && e.target.files[0]); });
    $('arBack').addEventListener('click', function () { setMode('place'); });
    $('arCalibOk').addEventListener('click', confirmCalib);
    $('arRecalib').addEventListener('click', enterCalib);
    $('arSave').addEventListener('click', save);

    var sel = $('arRefSelect'), cm = $('arRefCm');
    sel.addEventListener('change', function () {
      if (sel.value === 'custom') { cm.focus(); cm.select(); }
      else cm.value = sel.value;
      requestRender();
    });
    cm.addEventListener('input', function () {
      var match = Array.prototype.some.call(sel.options, function (o) { return o.value !== 'custom' && Number(o.value) === Number(cm.value); });
      if (!match) sel.value = 'custom';
      requestRender();
    });

    function slider(id, outId, key, fmt) {
      $(id).addEventListener('input', function (e) {
        S[key] = Number(e.target.value);
        $(outId).textContent = fmt(S[key]);
        requestRender();
      });
    }
    $('arScale').addEventListener('input', function (e) { S.scaleMul = Number(e.target.value) / 100; $('arScaleOut').textContent = e.target.value + '%'; requestRender(); });
    slider('arRot', 'arRotOut', 'rot', function (v) { return v + '°'; });
    slider('arYaw', 'arYawOut', 'yaw', function (v) { return v + '°'; });
    slider('arPitch', 'arPitchOut', 'pitch', function (v) { return v + '°'; });
    slider('arLight', 'arLightOut', 'light', function (v) { return v + '%'; });
    $('arShowDim').addEventListener('change', function (e) { S.showDim = e.target.checked; requestRender(); });

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    window.addEventListener('resize', function () { if (S && root && !root.hidden) layoutStage(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { if (S && root && !root.hidden) layoutStage(); }, 250); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root && !root.hidden) close(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S && S.src === 'video') { /* fon rejimida kamera yopiladi */ stopStream(); S.src = null; setMode('start'); }
    });
  }

  /* -------------------------------------------------------------- tashqariga */
  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('constructorArBtn');
    if (!btn) return;
    var label = btn.querySelector('span');
    if (label && isTouchDevice()) label.textContent = "Xonada ko'rish (AR)";
    btn.addEventListener('click', open);
  });

  window.lgArRoom = { open: open, close: close };
})();
