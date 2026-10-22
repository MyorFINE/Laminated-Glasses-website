/* Laminated Glasses — "Xonada ko'rish" (universal AR/3D) moduli.
 *
 * Hamma qurilmada ishlaydi (ARCore/ARKit shart emas):
 *  • Telefon: jonli kamera + oyna avtomatik devorga qo'yiladi. Giroskop bo'lsa, telefonni
 *    burganda oyna devorda joyida turadi.
 *  • Kompyuter (va kamerasiz telefon): xona rasmi yuklanadi, bosilgan joyga oyna qo'yiladi.
 *
 * Haqiqiy o'lcham (etalonsiz):
 *  • Kamera: "Devorgacha masofa" (m) + telefon kamerasining odatiy ko'rish burchagi.
 *  • Rasm: "Devorning ko'ringan eni" (m).
 *  Boshlang'ich qiymat o'zi tanlanadi va oyna kadrning ~65% idan kattalashmaydi.
 *
 * Realistiklik: perspektiva (3D burilish), shisha qalinligi (8 mm yon qirrasi), devorga
 * tushadigan soya, yorug' aks, xona yorug'ligiga moslash.
 *
 * Konstruktor bilan aloqa — constructor.html ichidagi window.lgConstructorAR:
 *   .isReady()        -> dizayn tayyormi
 *   .buildTexture()   -> { canvas, wCm, hCm, label } (panellar tashqarisi shaffof)
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var S = null, root = null, canvas, ctx;
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var gyroPerm = null;                    // iOS uchun ruxsat va'dasi (bosish paytida so'raladi)

  var FIT = 0.65;                         // oyna kadrning eng ko'pi bilan shu ulushi
  var MAXZ = 8;                           // eng katta kattalashtirish
  var THICK_CM = 0.8;                     // laminatsiyalangan shisha qalinligi

  function round1(n) { return Math.round(n * 10) / 10; }
  function toast(msg, isErr) { if (typeof showToast === 'function') showToast(msg, isErr); }
  function isTouchDevice() { return window.matchMedia && window.matchMedia('(pointer:coarse)').matches; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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
            '<p>Oyna devorga o\'zi joylashadi va xona ichida real ko\'rinadi.</p>' +
            '<div class="ar-native" id="arNative" hidden>' +
              '<button type="button" class="ar-btn ar-btn-main" id="arBtnNative">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>' +
                '<span>AR: devorga o\'rnatib ko\'rish</span>' +
              '</button>' +
              '<a class="ar-btn ar-btn-main ar-ql" id="arQL" rel="ar" hidden><img id="arQLImg" alt="" width="34" height="34"><span id="arQLText">AR tayyorlanmoqda…</span></a>' +
              '<ol class="ar-steps"><li>Xona yoritilgan bo\'lsin, devorda biroz tekstura yoki rozetka/burchak ko\'rinsin.</li><li>Telefonni sekin harakatlantirib devorni skanerlang.</li><li>Devor aniqlangach, oyna o\'sha joyga haqiqiy o\'lchamda o\'rnatiladi.</li></ol>' +
              '<details class="ar-opts"><summary>AR sozlamalari</summary>' +
                '<div class="ar-opts-grid">' +
                  '<label>Panellar oralig\'i (sm)<input type="number" id="arOptGap" min="0" max="20" step="0.5" value="2" inputmode="decimal"></label>' +
                  '<label>Panel qalinligi (sm)<input type="number" id="arOptThick" min="0.3" max="10" step="0.1" value="0.8" inputmode="decimal"></label>' +
                  '<label>Devordan masofa (sm)<input type="number" id="arOptStand" min="0" max="10" step="0.5" value="1" inputmode="decimal"></label>' +
                '</div>' +
              '</details>' +
              '<div class="ar-or">yoki oddiy rejim</div>' +
            '</div>' +
            '<button type="button" class="ar-btn ar-btn-main" id="arBtnCamera">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>' +
              'Jonli kamera (oddiy rejim)' +
            '</button>' +
            '<button type="button" class="ar-btn" id="arBtnPhoto">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>' +
              '<span id="arBtnPhotoText">Xona rasmini tanlash</span>' +
            '</button>' +
            '<div class="ar-start-err" id="arStartErr" role="alert"></div>' +
          '</div>' +
        '</div>' +
        '<div class="ar-hint" id="arHint" hidden></div>' +
        '<div class="ar-zoom" id="arZoom" hidden>' +
          '<button type="button" id="arZoomIn" aria-label="Kattalashtirish">+</button>' +
          '<button type="button" id="arZoomOutBtn" aria-label="Kichraytirish">−</button>' +
          '<button type="button" id="arZoomReset" aria-label="Asl holat">⟲</button>' +
          '<span id="arZoomVal">×1</span>' +
        '</div>' +
      '</div>' +
      '<div class="ar-panel" id="arPanel" hidden>' +
        '<div class="ar-step" id="arStepPlace">' +
          '<label class="ar-main-slider"><span id="arDistLabel">Devorgacha masofa</span> <output id="arDistOut">2 m</output><input type="range" id="arDist" min="0.8" max="6" step="0.1" value="2"></label>' +
          '<button type="button" class="ar-more-btn" id="arMoreBtn" aria-expanded="false"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>Sozlamalar</button>' +
          '<div class="ar-more" id="arMore">' +
            '<div class="ar-sliders">' +
              '<label>Burilish <output id="arRotOut">0°</output><input type="range" id="arRot" min="-15" max="15" step="0.5" value="0"></label>' +
              '<label>Yon perspektiva <output id="arYawOut">0°</output><input type="range" id="arYaw" min="-45" max="45" step="1" value="0"></label>' +
              '<label>Yuqori / past <output id="arPitchOut">0°</output><input type="range" id="arPitch" min="-30" max="30" step="1" value="0"></label>' +
              '<label>Yorug\'lik <output id="arLightOut">100%</output><input type="range" id="arLight" min="55" max="100" step="1" value="100"></label>' +
            '</div>' +
            '<label class="ar-check"><input type="checkbox" id="arShowDim" checked> O\'lchamni ko\'rsatish</label>' +
            '<label class="ar-check" id="arGyroRow" hidden><input type="checkbox" id="arGyro" checked> Devorga qotirish (telefonni burganda oyna joyida turadi)</label>' +
            '<button type="button" class="ar-link" id="arResetAdj">Sozlamalarni tiklash</button>' +
          '</div>' +
          '<div class="ar-actions">' +
            '<button type="button" class="ar-btn" id="arSource">Boshqa rasm / kamera</button>' +
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

  function freshState() {
    return {
      src: null, stream: null, video: null, photo: null, bg: null,
      mode: 'start',
      cw: 0, ch: 0, dpr: 1,
      dist: 2,                          // kamera: devorgacha masofa (m); rasm: ko'ringan devor eni (m)
      pos: { x: 0.5, y: 0.45 },
      rot: 0, yaw: 0, pitch: 0, light: 100, showDim: true,
      tex: null, quad: null, drag: null, raf: 0, loop: 0,
      z: 1, tx: 0, ty: 0, ptrs: {}, pinch: null, photoSrc: null,   // ko'rinish: kattalashtirish va siljitish
      gyroOn: false, gyroCur: null, gyroBase: null,
    };
  }

  /* ----------------------------------------------- masshtab (1 sm = necha px) */
  function fovRad() { return (S.ch > S.cw ? 52 : 65) * Math.PI / 180; }   // gorizontal ko'rish burchagi (taxminiy)
  function ppcFor(dist) {
    if (S.src === 'video') return S.cw / (2 * dist * 100 * Math.tan(fovRad() / 2));
    return S.cw / (dist * 100);
  }
  function ppc() { return ppcFor(S.dist); }
  // oyna kadrning FIT ulushiga sig'adigan eng kichik "masofa/eni"
  function fitDist() {
    var T = S.tex;
    var needW = T.wCm / (FIT * S.cw);          // kerakli (sm/px) -> dist formulalaridan teskari
    var needH = T.hCm / (FIT * S.ch);
    var cmPerPx = Math.max(needW, needH);       // 1 px = cmPerPx sm  (ya'ni ppc = 1/cmPerPx)
    var visibleWcm = cmPerPx * S.cw;
    return S.src === 'video' ? visibleWcm / (2 * 100 * Math.tan(fovRad() / 2)) : visibleWcm / 100;
  }

  /* ------------------------------------------------------- ochish/yopish */
  async function open() {
    var br = window.lgConstructorAR;
    if (!br || !br.isReady()) { toast("Avval o'lcham tanlang va rasm yuklang.", true); return; }
    // iOS: giroskop ruxsati faqat bosish paytida so'raladi — shuning uchun eng boshida (await'dan oldin).
    gyroPerm = requestGyro();
    build();
    stopStream();
    S = freshState();
    var tex = await br.buildTexture();
    if (!tex) { toast("Dizaynni tayyorlab bo'lmadi.", true); S = null; return; }
    S.tex = tex;

    $('arSizeInfo').textContent = tex.label + ' • ' + round1(tex.wCm) + ' × ' + round1(tex.hCm) + ' sm';
    $('arBtnPhotoText').textContent = isTouchDevice() ? 'Suratga olish / galereya' : 'Xona rasmini tanlash';
    $('arStartErr').textContent = '';
    setMode('start');
    root.hidden = false;
    document.body.classList.add('ar-lock');
    requestAnimationFrame(function () { root.classList.add('open'); layoutStage(); });
    await setupNative();                 // haqiqiy AR (devor aniqlash) mavjudmi?
    if (S && !S.native && isTouchDevice() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) startCamera();
  }

  function close() {
    if (!root || root.hidden) return;
    stopStream();
    if (S) { cancelAnimationFrame(S.raf); S.raf = 0; S.gyroOn = false; }
    if (S && S.qlUrl) { URL.revokeObjectURL(S.qlUrl); S.qlUrl = null; }
    root.classList.remove('open');
    root.hidden = true;
    document.body.classList.remove('ar-lock');
    S = null;
  }

  /* --------------------------------------------------------------- giroskop */
  async function requestGyro() {
    try {
      if (!('DeviceOrientationEvent' in window) || !isTouchDevice()) return false;
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        var r = await DeviceOrientationEvent.requestPermission();
        return r === 'granted';
      }
      return true;
    } catch (e) { return false; }
  }
  function onOrient(e) {
    if (!S || e.alpha == null || e.beta == null) return;
    S.gyroCur = { a: e.alpha, b: e.beta };
    if (!S.gyroOn || S.src !== 'video' || S.mode !== 'place' || S.drag) return;
    var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    if (ang !== 0) return;                       // faqat tik (portrait) holatda
    if (!S.gyroBase) { rebase(); return; }
    var g = S.gyroBase, f = (S.cw / 2) / Math.tan(fovRad() / 2);
    var da = ((S.gyroCur.a - g.a + 540) % 360) - 180;       // -180..180
    var db = S.gyroCur.b - g.b;
    var rad = Math.PI / 180;
    S.pos.x = (g.x * S.cw + f * Math.tan(da * rad)) / S.cw;
    S.pos.y = (g.y * S.ch + f * Math.tan(db * rad)) / S.ch;
    requestRender();
  }
  function rebase() {
    if (S && S.gyroCur) S.gyroBase = { a: S.gyroCur.a, b: S.gyroCur.b, x: S.pos.x, y: S.pos.y };
    else if (S) S.gyroBase = null;
  }
  async function setupGyro() {
    var ok = await gyroPerm;
    if (!S) return;
    $('arGyroRow').hidden = !(ok && S.src === 'video');
    S.gyroOn = !!(ok && S.src === 'video' && $('arGyro').checked);
    if (ok) window.addEventListener('deviceorientation', onOrient);
    S.gyroBase = null;
  }

  /* ---------------------------------------------------------- manba: kamera */
  function stopStream() {
    if (S && S.stream) { S.stream.getTracks().forEach(function (t) { t.stop(); }); S.stream = null; }
    var v = $('arVideo'); if (v) { try { v.pause(); } catch (e) {} v.srcObject = null; }
    if (S) S.loop = 0;
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
      v.srcObject = stream; v.muted = true; v.setAttribute('playsinline', '');
      await v.play();
      S.src = 'video'; S.video = v; S.photo = null; S.bg = null;
      layoutStage();
      autoPlace();
      await setupGyro();
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
      S.src = 'photo'; S.photo = img; S.video = null; S.gyroOn = false;
      var msc = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));
      if (msc < 1) {
        var pc = document.createElement('canvas');
        pc.width = Math.round(img.naturalWidth * msc); pc.height = Math.round(img.naturalHeight * msc);
        var pctx = pc.getContext('2d'); pctx.imageSmoothingQuality = 'high'; pctx.drawImage(img, 0, 0, pc.width, pc.height);
        S.photoSrc = pc;
      } else S.photoSrc = img;
      $('arGyroRow').hidden = true;
      layoutStage();
      autoPlace();
    };
    img.onerror = function () { URL.revokeObjectURL(url); err.textContent = "Rasmni ochib bo'lmadi. Boshqa rasm tanlang."; };
    img.src = url;
  }

  /* -------------------------------------------------- avtomatik joylashtirish */
  function autoPlace() {
    S.z = 1; S.tx = 0; S.ty = 0; syncZoomUi();
    setMode('place');                                                 // avval panel -> canvas yakuniy o'lchamga keladi
    var base;
    if (S.src === 'video') base = 2;                                  // devordan ~2 m
    else base = clamp(2.6 * S.cw / S.ch, 2, 6);                       // rasm balandligi ~2.6 m (shift)
    var d = Math.max(base, fitDist());                                // kadrdan katta bo'lmasin
    var sl = $('arDist');
    var isVideo = S.src === 'video';
    $('arDistLabel').textContent = isVideo ? 'Devorgacha masofa' : "Devorning ko'ringan eni";
    sl.min = isVideo ? 0.5 : 1; sl.max = Math.max(isVideo ? 6 : 8, Math.ceil(d * 1.5));
    S.dist = Math.round(d * 10) / 10;
    sl.value = S.dist; $('arDistOut').textContent = S.dist + ' m';
    S.pos = { x: 0.5, y: 0.45 };
    S.rot = 0; S.yaw = 0; S.pitch = 0; S.light = 100;
    [['arRot','arRotOut','0°'],['arYaw','arYawOut','0°'],['arPitch','arPitchOut','0°']].forEach(function (a) { $(a[0]).value = 0; $(a[1]).textContent = a[2]; });
    $('arLight').value = 100; $('arLightOut').textContent = '100%';
    S.gyroBase = null;
    requestRender();
  }

  function setMode(m) {
    S.mode = m;
    $('arStart').hidden = (m !== 'start');
    $('arPanel').hidden = (m === 'start');
    $('arZoom').hidden = (m !== 'place');
    root.classList.toggle('has-panel', m === 'place');
    var hint = $('arHint');
    if (m === 'place') {
      hint.hidden = false;
      hint.textContent = S.src === 'video'
        ? "Oynani suring. Ikki barmoq bilan kattalashtiring, bo'sh joyni sudrab xonani siljiting."
        : "Bo'sh joyni bossangiz oyna o'sha yerga o'tadi. G'ildirak yoki +/− bilan kattalashtiring, sudrab siljiting.";
    } else hint.hidden = true;
    layoutStage();            // panel chiqdi/yo'qoldi -> maydon o'zgardi: canvas'ni yangi maydonga to'g'ri (siqmasdan) moslaymiz
  }

  /* -------------------------------------------------------------- canvas */
  function layoutStage() {
    if (!S || !canvas) return;
    var b = $('arStageBox');
    var box = { w: Math.max(120, b.clientWidth), h: Math.max(120, b.clientHeight) };
    var dpr = Math.min(S.src === 'video' ? 2 : 3, window.devicePixelRatio || 1);   // jonli kamerada 2, rasmda 3 (aniqroq)
    var w = box.w, h = box.h;
    if (S.src === 'photo' && S.photo) {
      var sc = Math.min(box.w / S.photo.naturalWidth, box.h / S.photo.naturalHeight);
      w = Math.max(80, Math.round(S.photo.naturalWidth * sc));
      h = Math.max(80, Math.round(S.photo.naturalHeight * sc));
    }
    if (S.cw === w && S.ch === h && S.dpr === dpr && canvas.width === Math.round(w * dpr)) { requestRender(); return; }
    S.cw = w; S.ch = h; S.dpr = dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    clampView();
    requestRender();
  }

  function requestRender() {
    if (!S || (S.src === 'video' && S.loop)) return;
    if (S.raf) return;
    S.raf = requestAnimationFrame(function () { if (S) { S.raf = 0; render(); } });
  }
  function startLoop() {
    if (!S || S.loop) return;
    S.loop = 1;
    (function tick() { if (!S || !S.loop) return; render(); requestAnimationFrame(tick); })();
  }

  function drawBackground() {
    var W = S.cw, H = S.ch;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = '#0b1c2a';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(S.tx, S.ty); ctx.scale(S.z, S.z);       // fon ham, oyna ham SHU ko'rinish bilan birga kattalashadi
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (S.src === 'video' && S.video && S.video.videoWidth) {
      var vw = S.video.videoWidth, vh = S.video.videoHeight;
      var sc = Math.max(W / vw, H / vh);
      ctx.drawImage(S.video, (W - vw * sc) / 2, (H - vh * sc) / 2, vw * sc, vh * sc);
    } else if (S.src === 'photo' && S.photoSrc) {
      ctx.drawImage(S.photoSrc, 0, 0, W, H);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------- kattalashtirish / siljitish */
  function clampView() {
    S.z = clamp(S.z, 1, MAXZ);
    S.tx = clamp(S.tx, S.cw * (1 - S.z), 0);
    S.ty = clamp(S.ty, S.ch * (1 - S.z), 0);
  }
  function syncZoomUi() { var v = $('arZoomVal'); if (v && S) v.textContent = '×' + (Math.round(S.z * 10) / 10); }
  function zoomAt(px, py, factor) {
    var sx = (px - S.tx) / S.z, sy = (py - S.ty) / S.z;
    S.z = clamp(S.z * factor, 1, MAXZ);
    S.tx = px - sx * S.z; S.ty = py - sy * S.z;
    clampView(); syncZoomUi(); requestRender();
  }
  function toScene(p) { return { x: (p.x - S.tx) / S.z, y: (p.y - S.ty) / S.z }; }

  function render() {
    if (!S || !ctx || !S.cw) return;
    drawBackground();
    if (S.mode === 'place') drawGlass(ctx);
  }

  function pill(c, text, x, y) {
    c.save();
    c.font = '700 13px Manrope, system-ui, sans-serif';
    var tw = c.measureText(text).width + 18;
    var px = clamp(x, tw / 2 + 4, S.cw - tw / 2 - 4), py = clamp(y, 16, S.ch - 16);
    c.fillStyle = 'rgba(6,28,44,.82)';
    var r = 12, x0 = px - tw / 2, y0 = py - 12, h = 24;
    c.beginPath();
    c.moveTo(x0 + r, y0); c.arcTo(x0 + tw, y0, x0 + tw, y0 + h, r); c.arcTo(x0 + tw, y0 + h, x0, y0 + h, r);
    c.arcTo(x0, y0 + h, x0, y0, r); c.arcTo(x0, y0, x0 + tw, y0, r); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, px, py + 1);
    c.restore();
  }

  /* ------------------------------------------------------------ 3D proyeksiya */
  /* u,v ∈ [0..1] — oyna yuzidagi nuqta; zOff — devor tomonga (kameradan uzoqqa) chuqurlik.
     Markazda (z=0) masshtab o'zgarmaydi → o'lcham saqlanadi. */
  function makeProjector(cx, cy, W, H, rotDeg, yawDeg, pitchDeg) {
    var a = yawDeg * Math.PI / 180, b = pitchDeg * Math.PI / 180, r = rotDeg * Math.PI / 180;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cr = Math.cos(r), sr = Math.sin(r);
    var f = Math.max(W, H) * 2.5;
    return function (u, v, zOff) {
      var x = (u - 0.5) * W, y = (v - 0.5) * H, z = zOff || 0;
      var x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      var y2 = y * cb - z1 * sb, z2 = y * sb + z1 * cb;
      var xr = x1 * cr - y2 * sr, yr = x1 * sr + y2 * cr;
      var s = f / (f + z2);
      return [cx + xr * s, cy + yr * s];
    };
  }

  function drawTri(c, img, s0, s1, s2, d0, d1, d2) {
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

  /* Tekstura "mip" darajalari: katta rasmni ekranga bir yo'la kichraytirsak tishlanadi — avval 2 barobardan kichraytirib boramiz */
  function pickLevel(T, wantW) {
    if (!T.levels) T.levels = [T.canvas];
    var lv = T.levels, i = 0;
    while (lv[i].width / 2 >= wantW && lv[i].width > 64) {
      if (!lv[i + 1]) {
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(lv[i].width / 2)); c.height = Math.max(1, Math.round(lv[i].height / 2));
        var cx = c.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(lv[i], 0, 0, c.width, c.height);
        lv[i + 1] = c;
      }
      i++;
    }
    return lv[i];
  }

  function drawGlass(target) {
    var T = S.tex; if (!T) return;
    var k = ppc() * S.z;                       // zoom bilan birga oyna ham kattalashadi — masshtab saqlanadi
    var W = T.wCm * k, H = T.hCm * k;
    if (!(W > 1 && H > 1)) return;
    var cx = S.pos.x * S.cw * S.z + S.tx, cy = S.pos.y * S.ch * S.z + S.ty;
    var P = makeProjector(cx, cy, W, H, S.rot, S.yaw, S.pitch);
    var q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    S.quad = q;
    var tilted = !!(S.yaw || S.pitch);
    var th = Math.max(1.5, THICK_CM * k);
    var back = tilted ? [P(0, 0, th), P(1, 0, th), P(1, 1, th), P(0, 1, th)] : null;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    q.concat(back || []).forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var blur = Math.min(36, Math.max(8, Math.min(W, H) * 0.06));
    var pad = Math.ceil(blur * 2.2);
    // faqat ekranda ko'rinadigan qismini chizamiz (kattalashtirilganda xotira/tezlik uchun)
    var x0 = Math.max(Math.floor(minX - pad), -pad), y0 = Math.max(Math.floor(minY - pad), -pad);
    var x1 = Math.min(Math.ceil(maxX + pad), S.cw + pad), y1 = Math.min(Math.ceil(maxY + pad), S.ch + pad);
    if (x1 <= x0 || y1 <= y0) return;
    var bx = x0, by = y0, bw = x1 - x0, bh = y1 - y0;

    var dpr = S.dpr;
    var ow = Math.max(1, Math.round(bw * dpr)), oh = Math.max(1, Math.round(bh * dpr));
    if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, off.width, off.height);
    octx.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';

    // Shisha qalinligi: har bir panelning yon qirralari (perspektivada ko'rinadi), old yuz ustidan chiziladi
    if (tilted) {
      octx.lineJoin = 'round';
      (T.rects || [{ u0: 0, u1: 1, v0: 0, v1: 1 }]).forEach(function (r) {
        var f4 = [P(r.u0, r.v0), P(r.u1, r.v0), P(r.u1, r.v1), P(r.u0, r.v1)];
        var b4 = [P(r.u0, r.v0, th), P(r.u1, r.v0, th), P(r.u1, r.v1, th), P(r.u0, r.v1, th)];
        for (var e = 0; e < 4; e++) {
          var e2 = (e + 1) % 4;
          octx.beginPath();
          octx.moveTo(f4[e][0], f4[e][1]); octx.lineTo(f4[e2][0], f4[e2][1]);
          octx.lineTo(b4[e2][0], b4[e2][1]); octx.lineTo(b4[e][0], b4[e][1]); octx.closePath();
          octx.fillStyle = 'rgba(176,222,212,0.95)'; octx.fill();
          octx.strokeStyle = 'rgba(40,90,90,0.45)'; octx.lineWidth = 0.8; octx.stroke();
        }
      });
    }

    var tc = pickLevel(T, W * S.dpr);
    if (!tilted) {
      octx.save();
      octx.translate(cx, cy); octx.rotate(S.rot * Math.PI / 180);
      octx.drawImage(tc, -W / 2, -H / 2, W, H);
      octx.restore();
    } else {
      var N = 14, tw = tc.width, thp = tc.height, g = [], i, j;
      for (j = 0; j <= N; j++) { g[j] = []; for (i = 0; i <= N; i++) g[j][i] = { d: P(i / N, j / N), s: [i / N * tw, j / N * thp] }; }
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var p00 = g[j][i], p10 = g[j][i + 1], p11 = g[j + 1][i + 1], p01 = g[j + 1][i];
        drawTri(octx, tc, p00.s, p10.s, p11.s, p00.d, p10.d, p11.d);
        drawTri(octx, tc, p00.s, p11.s, p01.s, p00.d, p11.d, p01.d);
      }
    }

    // Yorug' aks + xona yorug'ligiga moslash (faqat oyna piksellariga)
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

    // Devorga tushadigan soya
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.shadowColor = 'rgba(0,0,0,0.38)';
    target.shadowBlur = blur * dpr;
    target.shadowOffsetX = blur * 0.22 * dpr;
    target.shadowOffsetY = blur * 0.45 * dpr;
    target.drawImage(off, bx * dpr, by * dpr, bw * dpr, bh * dpr);
    target.restore();

    if (S.showDim) {
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
  function startPinch() {
    var ids = Object.keys(S.ptrs).slice(0, 2);
    var a = S.ptrs[ids[0]], b = S.ptrs[ids[1]];
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    S.pinch = { ids: ids, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: S.z, sx: (mx - S.tx) / S.z, sy: (my - S.ty) / S.z };
  }
  function updatePinch() {
    var pc = S.pinch, a = S.ptrs[pc.ids[0]], b = S.ptrs[pc.ids[1]];
    if (!a || !b) return;
    S.z = clamp(pc.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pc.d0, 1, MAXZ);
    S.tx = (a.x + b.x) / 2 - pc.sx * S.z; S.ty = (a.y + b.y) / 2 - pc.sy * S.z;
    clampView(); syncZoomUi(); requestRender();
  }

  function onDown(e) {
    if (!S || S.mode !== 'place') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var p = pointer(e);
    S.ptrs[e.pointerId] = p;
    if (Object.keys(S.ptrs).length >= 2) { S.drag = null; startPinch(); return; }
    if (pointInQuad(p)) {
      var sc = toScene(p);
      S.drag = { t: 'glass', dx: S.pos.x * S.cw - sc.x, dy: S.pos.y * S.ch - sc.y };         // oynani siljitish
    } else {
      S.drag = { t: 'bg', sx: p.x, sy: p.y, tx: S.tx, ty: S.ty, moved: false };              // bosish = qo'yish, sudrash = xonani siljitish
    }
  }
  function onMove(e) {
    if (!S) return;
    var p = pointer(e);
    if (S.ptrs[e.pointerId]) S.ptrs[e.pointerId] = p;
    if (S.pinch) { updatePinch(); return; }
    var d = S.drag; if (!d) return;
    if (d.t === 'glass') {
      var sc = toScene(p);
      S.pos.x = clamp((sc.x + d.dx) / S.cw, 0, 1); S.pos.y = clamp((sc.y + d.dy) / S.ch, 0, 1);
    } else {
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) < 6) return;
      d.moved = true;
      S.tx = d.tx + (p.x - d.sx); S.ty = d.ty + (p.y - d.sy);
      clampView();
    }
    requestRender();
  }
  function onUp(e) {
    if (!S) return;
    var d = S.drag;
    if (d && d.t === 'bg' && !d.moved && !S.pinch) {          // oddiy bosish: oyna o'sha joyga o'tadi
      var sc = toScene(pointer(e));
      S.pos.x = clamp(sc.x / S.cw, 0, 1); S.pos.y = clamp(sc.y / S.ch, 0, 1);
      rebase(); requestRender();
    } else if (d && d.t === 'glass') rebase();                // yangi joy giroskop uchun "devordagi nuqta" bo'ladi
    delete S.ptrs[e.pointerId];
    if (Object.keys(S.ptrs).length < 2) S.pinch = null;
    S.drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  }
  function onWheel(e) {
    if (!S || S.mode !== 'place') return;
    e.preventDefault();
    var p = pointer(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  }

  /* --------------------------------------------------------------- saqlash */
  async function save() {
    if (!S || S.mode !== 'place') return;
    render();
    var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.95); });
    if (!blob) { toast("Rasmni saqlab bo'lmadi.", true); return; }
    var name = 'oyna-xonada-' + new Date().toISOString().slice(0, 10) + '.jpg';
    try {
      var file = new File([blob], name, { type: 'image/jpeg' });
      if (isTouchDevice() && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Oyna xonamda' });
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
    $('arBtnNative').addEventListener('click', launchNative);
    $('arBtnCamera').addEventListener('click', function () { gyroPerm = requestGyro(); startCamera(); });
    $('arBtnPhoto').addEventListener('click', function () { $('arFile').value = ''; $('arFile').click(); });
    $('arFile').addEventListener('change', function (e) { loadPhoto(e.target.files && e.target.files[0]); });
    $('arSource').addEventListener('click', function () {
      stopStream(); S.src = null; S.photo = null; S.bg = null; S.video = null; S.gyroOn = false;
      $('arGyroRow').hidden = true; layoutStage(); setMode('start');
    });
    $('arSave').addEventListener('click', save);
    $('arMoreBtn').addEventListener('click', function () {
      var m = $('arMore'), open = !m.classList.contains('open');
      m.classList.toggle('open', open); this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('arResetAdj').addEventListener('click', function () {
      S.rot = 0; S.yaw = 0; S.pitch = 0; S.light = 100;
      [['arRot','arRotOut','0°'],['arYaw','arYawOut','0°'],['arPitch','arPitchOut','0°'],['arLight','arLightOut','100%']].forEach(function (a) {
        $(a[0]).value = a[0] === 'arLight' ? 100 : 0; $(a[1]).textContent = a[2];
      });
      requestRender();
    });

    function slider(id, outId, key, fmt) {
      $(id).addEventListener('input', function (e) { S[key] = Number(e.target.value); $(outId).textContent = fmt(S[key]); requestRender(); });
    }
    slider('arDist', 'arDistOut', 'dist', function (v) { return round1(v) + ' m'; });
    slider('arRot', 'arRotOut', 'rot', function (v) { return v + '°'; });
    slider('arYaw', 'arYawOut', 'yaw', function (v) { return v + '°'; });
    slider('arPitch', 'arPitchOut', 'pitch', function (v) { return v + '°'; });
    slider('arLight', 'arLightOut', 'light', function (v) { return v + '%'; });
    $('arShowDim').addEventListener('change', function (e) { S.showDim = e.target.checked; requestRender(); });
    $('arGyro').addEventListener('change', function (e) { S.gyroOn = e.target.checked; rebase(); });

    canvas.addEventListener('wheel', onWheel, { passive: false });
    $('arZoomIn').addEventListener('click', function () { if (S) zoomAt(S.cw / 2, S.ch / 2, 1.4); });
    $('arZoomOutBtn').addEventListener('click', function () { if (S) zoomAt(S.cw / 2, S.ch / 2, 1 / 1.4); });
    $('arZoomReset').addEventListener('click', function () { if (S) { S.z = 1; S.tx = 0; S.ty = 0; syncZoomUi(); requestRender(); } });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    if (window.ResizeObserver) new ResizeObserver(function () { if (S && root && !root.hidden) layoutStage(); }).observe($('arStageBox'));
    window.addEventListener('resize', function () { if (S && root && !root.hidden) layoutStage(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { if (S && root && !root.hidden) layoutStage(); }, 250); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root && !root.hidden) close(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S && S.src === 'video') { stopStream(); S.src = null; S.gyroOn = false; $('arGyroRow').hidden = true; setMode('start'); }
    });
  }

  /* ====================================================== HAQIQIY AR (devor aniqlash) */
  async function detectNative() {
    try {
      var ua = navigator.userAgent || '';
      var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (isIOS) {
        var a = document.createElement('a');
        return (a.relList && a.relList.supports && a.relList.supports('ar')) ? 'quicklook' : null;   // AR Quick Look
      }
      if (navigator.xr && navigator.xr.isSessionSupported && await navigator.xr.isSessionSupported('immersive-ar')) return 'webxr';
    } catch (e) {}
    return null;
  }

  function readNativeOpts() {
    function num(id, def, a, b) { var v = parseFloat($(id).value); if (!isFinite(v)) v = def; return clamp(v, a, b); }
    return { gapCm: num('arOptGap', 2, 0, 20), thickCm: num('arOptThick', 0.8, 0.3, 10), standoffCm: num('arOptStand', 1, 0, 10) };
  }

  // Har bir panel uchun alohida tekstura va haqiqiy o'lcham (sm)
  function paneSpecs() {
    var T = S.tex, W = T.canvas.width, H = T.canvas.height;
    return T.rects.map(function (r, i) {
      var x = Math.round(r.u0 * W), y = Math.round(r.v0 * H), w = Math.max(1, Math.round((r.u1 - r.u0) * W)), h = Math.max(1, Math.round((r.v1 - r.v0) * H));
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(T.canvas, x, y, w, h, 0, 0, w, h);
      return { canvas: c, wCm: T.panes[i].wCm, hCm: T.panes[i].hCm };
    });
  }
  function thumbUrl() {
    var T = S.tex, sc = 68 / T.canvas.height, c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(T.canvas.width * sc)); c.height = 68;
    c.getContext('2d').drawImage(T.canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  async function setupNative() {
    var box = $('arNative');
    box.hidden = true;
    S.native = await detectNative();
    if (!S || !S.native) return;
    // three.js modulini oldindan yuklaymiz (bosish paytida kechikish bo'lmasin)
    S.nativeMod = import('/js/ar-native.js').catch(function () { return null; });
    var mod = await S.nativeMod;
    if (!S) return;
    if (!mod) { S.native = null; return; }      // modul/CDN yuklanmadi — oddiy rejim qoladi
    box.hidden = false;
    var btn = $('arBtnNative'), ql = $('arQL');
    if (S.native === 'quicklook') {
      btn.hidden = true; ql.hidden = false;
      $('arQLImg').src = thumbUrl();
      prepareQuickLook();
      ['arOptGap', 'arOptThick', 'arOptStand'].forEach(function (id) { $(id).addEventListener('change', prepareQuickLook); });
    } else {
      btn.hidden = false; ql.hidden = true;
    }
  }

  // iPhone: USDZ'ni oldindan tayyorlab, haqiqiy havolaga (rel="ar") ulaymiz — foydalanuvchi aynan shu havolani bosadi
  async function prepareQuickLook() {
    if (!S) return;
    var ql = $('arQL'), txt = $('arQLText');
    var my = S.qlToken = (S.qlToken || 0) + 1;
    ql.classList.add('is-busy'); ql.removeAttribute('href'); txt.textContent = 'AR tayyorlanmoqda…';
    try {
      var mod = await S.nativeMod;
      var url = await mod.buildQuickLookUrl({ panes: paneSpecs(), label: S.tex.label }, readNativeOpts());
      if (!S || my !== S.qlToken) { URL.revokeObjectURL(url); return; }
      if (S.qlUrl) URL.revokeObjectURL(S.qlUrl);
      S.qlUrl = url;
      ql.href = url + '#allowsContentScaling=0';        // pinch bilan o'lchamni buzib bo'lmasin
      ql.classList.remove('is-busy');
      txt.textContent = "AR: devorga o'rnatib ko'rish";
    } catch (e) {
      if (S && my === S.qlToken) { txt.textContent = 'AR tayyorlab bo\'lmadi — oddiy rejimdan foydalaning'; }
    }
  }

  async function launchNative() {
    if (!S || S.native !== 'webxr') return;
    var mod = await S.nativeMod;
    if (!mod) { toast("AR moduli yuklanmadi. Oddiy rejimdan foydalaning.", true); return; }
    try {
      await mod.launchWebXR({ panes: paneSpecs(), label: S.tex.label }, readNativeOpts());
    } catch (e) {
      var n = e && e.name;
      toast((n === 'NotAllowedError' || n === 'SecurityError')
        ? "AR uchun kamera ruxsati kerak. Ruxsat bering yoki oddiy rejimdan foydalaning."
        : "AR ishga tushmadi. Oddiy rejimdan foydalaning.", true);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('constructorArBtn');
    if (!btn) return;
    var label = btn.querySelector('span');
    if (label && isTouchDevice()) label.textContent = "Xonada ko'rish (AR)";
    btn.addEventListener('click', open);
  });

  window.lgArRoom = { open: open, close: close };
})();
