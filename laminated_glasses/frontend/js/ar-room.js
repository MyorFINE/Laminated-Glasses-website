/* Laminated Glasses — "Xonada ko'rish" studiyasi (premium).
 *
 * Mijoz xonasining FOTOSURATINI yuklaydi, devorni belgilaydi — konstruktorda tayyorlangan
 * oyna shu devorning perspektivasida va HAQIQIY o'lchamda (sm) joylashadi.
 *
 *  1) Rasm    — xona fotosurati yuklanadi (tanlash, sudrab tashlash yoki Ctrl+V).
 *  2) Devor   — devordagi to'rtburchakning (eshik, devor bo'lagi) 4 burchagi belgilanadi,
 *               haqiqiy o'lchami kiritiladi → gomografiya: aniq perspektiva + aniq masshtab.
 *               (O'tkazib yuborilsa — "tez rejim": devorga to'g'ri qaralgan deb olinadi.)
 *  3) Natija  — oyna devorga bosib qo'yiladi; xona yorug'ligi va rangiga avtomatik moslanadi;
 *               kattalashtirish/siljitish, "Oldin / Keyin", rasmni saqlash.
 *
 * Fotosurat serverga YUBORILMAYDI — hammasi mijozning qurilmasida bajariladi.
 *
 * Konstruktor bilan aloqa (constructor.html): window.lgConstructorAR
 *   .isReady()        -> dizayn tayyormi
 *   .buildTexture()   -> { canvas, wCm, hCm, rects, label } (panellar orasi/tashqarisi shaffof)
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var S = null, root = null, canvas, ctx;
  var off = document.createElement('canvas'), octx = off.getContext('2d');
  var noisePat = null;

  var FIT = 0.65;          // tez rejimda oyna kadrning eng ko'pi bilan shu ulushi
  var THICK_CM = 0.8;      // laminatsiyalangan shisha qalinligi
  var MAXZ = 8;            // eng katta kattalashtirish
  var MAX_FILE_MB = 30;
  var CORNERS = ['yuqori-chap', 'yuqori-o\'ng', 'pastki-o\'ng', 'pastki-chap'];

  function round1(n) { return Math.round(n * 10) / 10; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function toast(msg, isErr) { if (typeof showToast === 'function') showToast(msg, isErr); }

  /* =================================================================== DOM */
  var ICON = {
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h8M16 6h4M4 12h4M12 12h8M4 18h10M18 18h2"/><circle cx="14" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/></svg>',
    wall: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5l18-2v18L3 19z"/><path d="M3 5l0 14"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5"/><path d="M4 19h16"/></svg>',
  };

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
      '<header class="ar-top">' +
        '<div class="ar-brand"><span class="ar-logo" aria-hidden="true">' + ICON.wall + '</span>' +
          '<div class="ar-brand-t"><strong>Xonada ko\'rish</strong><span id="arSizeInfo"></span></div></div>' +
        '<ol class="ar-stepper" id="arStepper" aria-label="Qadamlar">' +
          '<li data-s="upload"><i>1</i><span>Rasm</span></li><li data-s="mark"><i>2</i><span>Devor</span></li><li data-s="place"><i>3</i><span>Natija</span></li>' +
        '</ol>' +
        '<button type="button" class="ar-close" id="arClose" aria-label="Yopish">✕</button>' +
      '</header>' +
      '<div class="ar-stagebox" id="arStageBox">' +
        '<canvas id="arCanvas"></canvas>' +
        '<div class="ar-start" id="arStart">' +
          '<div class="ar-drop" id="arDrop" tabindex="0" role="button" aria-label="Xona rasmini yuklash">' +
            '<div class="ar-drop-ic">' + ICON.upload + '</div>' +
            '<h3>Xonangiz rasmini yuklang</h3>' +
            '<p>Oyna devoringizda <b>real o\'lchamda</b> va to\'g\'ri perspektivada ko\'rinadi.</p>' +
            '<span class="ar-btn ar-btn-main">Rasm tanlash</span>' +
            '<small>yoki rasmni shu yerga sudrab tashlang • Ctrl+V</small>' +
            '<div class="ar-tips"><span>Devor to\'liq ko\'ringan</span><span>Yaxshi yoritilgan</span><span>Imkon qadar to\'g\'ri burchakdan</span></div>' +
            '<div class="ar-start-err" id="arStartErr" role="alert"></div>' +
          '</div>' +
        '</div>' +
        '<div class="ar-hint" id="arHint" hidden></div>' +
        '<div class="ar-tools" id="arTools" hidden>' +
          '<button type="button" id="arZoomIn" aria-label="Kattalashtirish" title="Kattalashtirish (+)">+</button>' +
          '<button type="button" id="arZoomOutBtn" aria-label="Kichraytirish" title="Kichraytirish (−)">−</button>' +
          '<button type="button" id="arZoomReset" aria-label="Asl holat" title="Asl holat (0)">⟲</button>' +
          '<span id="arZoomVal">×1</span>' +
        '</div>' +
        '<button type="button" class="ar-before" id="arBefore" hidden title="Bosib turing (B)">' + ICON.eye + '<span>Oldin / Keyin</span></button>' +
      '</div>' +
      '<aside class="ar-panel" id="arPanel" hidden>' +
        /* 2-qadam: devorni belgilash */
        '<section class="ar-step" id="arStepMark" hidden>' +
          '<h4 class="ar-h">Devorni belgilang</h4>' +
          '<p class="ar-note">Devordagi biror <b>to\'rtburchak</b> (eshik, devorning bir qismi, pol–shift) <b>4 burchagini</b> rasmda bosing. Uning <b>eni</b>ni (sm) kiriting — bo\'yi avtomatik hisoblanadi. Oyna belgilangan joyning markaziga, devor perspektivasida joylashadi.</p>' +
          '<label class="ar-field"><span>Nimani belgilayapsiz?</span>' +
            '<select id="arPlaneRef">' +
              '<option value="door">Eshik (90 × 200 sm)</option>' +
              '<option value="wall">Devor bo\'lagi (bo\'yi avtomatik)</option>' +
              '<option value="a4">A4 qog\'oz (21 × 29.7 sm)</option>' +
              '<option value="custom">Boshqa narsa</option>' +
            '</select></label>' +
          '<div class="ar-wh">' +
            '<label class="ar-field"><span>Eni (sm)</span><input type="number" id="arPlaneW" min="5" max="2000" step="1" value="90" inputmode="decimal"></label>' +
            '<label class="ar-field"><span>Bo\'yi (sm)</span><input type="number" id="arPlaneH" min="5" max="2000" step="1" value="200" inputmode="decimal"></label>' +
          '</div>' +
          '<div class="ar-mark-status" id="arMarkStatus"></div>' +
          '<div class="ar-actions">' +
            '<button type="button" class="ar-btn" id="arMarkClear">Qayta belgilash</button>' +
            '<button type="button" class="ar-btn ar-btn-main" id="arMarkOk" disabled>Davom etish</button>' +
          '</div>' +
          '<button type="button" class="ar-link" id="arMarkSkip">O\'tkazib yuborish — tez rejim</button>' +
        '</section>' +
        /* 3-qadam: natija */
        '<section class="ar-step" id="arStepPlace" hidden>' +
          '<h4 class="ar-h">Natija</h4>' +
          '<label class="ar-main-slider ar-quick"><span>Devorning ko\'ringan eni</span> <output id="arDistOut">3 m</output><input type="range" id="arDist" min="1" max="8" step="0.1" value="3"></label>' +
          '<button type="button" class="ar-more-btn" id="arMoreBtn" aria-expanded="false">' + ICON.sliders + 'Sozlamalar</button>' +
          '<div class="ar-more" id="arMore">' +
            '<div class="ar-sliders">' +
              '<label>Burilish <output id="arRotOut">0°</output><input type="range" id="arRot" min="-15" max="15" step="0.5" value="0"></label>' +
              '<label class="ar-quick">Yon perspektiva <output id="arYawOut">0°</output><input type="range" id="arYaw" min="-45" max="45" step="1" value="0"></label>' +
              '<label class="ar-quick">Yuqori / past <output id="arPitchOut">0°</output><input type="range" id="arPitch" min="-30" max="30" step="1" value="0"></label>' +
              '<label>Yorug\'lik <output id="arLightOut">100%</output><input type="range" id="arLight" min="45" max="100" step="1" value="100"></label>' +
            '</div>' +
            '<label class="ar-check"><input type="checkbox" id="arShowDim" checked> O\'lchamni ko\'rsatish</label>' +
            '<label class="ar-check"><input type="checkbox" id="arAuto" checked> Xona yorug\'ligi va rangiga moslash</label>' +
            '<button type="button" class="ar-link" id="arResetAdj">Sozlamalarni tiklash</button>' +
          '</div>' +
          '<div class="ar-actions ar-actions-col">' +
            '<button type="button" class="ar-btn ar-btn-main" id="arSave">' + ICON.save + 'Rasmni saqlash</button>' +
            '<div class="ar-row2">' +
              '<button type="button" class="ar-btn" id="arPlaneBtn">' + ICON.wall + '<span id="arPlaneBtnT">Devorni belgilash</span></button>' +
              '<button type="button" class="ar-btn" id="arNewPhoto">' + ICON.upload + 'Boshqa rasm</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</aside>' +
      '<input type="file" id="arFile" accept="image/*" hidden>';
    document.body.appendChild(root);
    canvas = $('arCanvas');
    ctx = canvas.getContext('2d');
    bind();
  }

  function freshState() {
    return {
      mode: 'upload',
      photo: null, photoSrc: null,
      cw: 0, ch: 0, dpr: 1,
      z: 1, tx: 0, ty: 0, ptrs: {}, pinch: null, drag: null,
      // tez rejim
      dist: 3, pos: { x: 0.5, y: 0.45 }, yaw: 0, pitch: 0,
      // devor tekisligi (aniq rejim)
      markPts: [], plane: null, pp: null,
      // umumiy
      rot: 0, light: 100, tint: null, showDim: true, auto: true, before: false,
      tex: null, quad: null, raf: 0,
    };
  }

  /* ============================================================ ochish/yopish */
  async function open() {
    var br = window.lgConstructorAR;
    if (!br || !br.isReady()) { toast("Avval o'lcham tanlang va rasm yuklang.", true); return; }
    build();
    S = freshState();
    var tex = await br.buildTexture();
    if (!tex) { toast("Dizaynni tayyorlab bo'lmadi.", true); S = null; return; }
    S.tex = tex;
    $('arSizeInfo').textContent = tex.label + ' • ' + round1(tex.wCm) + ' × ' + round1(tex.hCm) + ' sm';
    $('arStartErr').textContent = '';
    setMode('upload');
    root.hidden = false;
    document.body.classList.add('ar-lock');
    requestAnimationFrame(function () { root.classList.add('open'); layoutStage(); });
    setTimeout(function () { var d = $('arDrop'); if (d && S && S.mode === 'upload') d.focus({ preventScroll: true }); }, 250);
  }

  function close() {
    if (!root || root.hidden) return;
    if (S) { cancelAnimationFrame(S.raf); S.raf = 0; }
    root.classList.remove('open');
    root.hidden = true;
    document.body.classList.remove('ar-lock');
    S = null;
  }

  /* ============================================================== rasm yuklash */
  function loadPhoto(file) {
    var err = $('arStartErr');
    err.textContent = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { err.textContent = 'Faqat rasm fayli tanlang (JPG, PNG, WEBP, HEIC).'; return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { err.textContent = 'Rasm juda katta (' + MAX_FILE_MB + ' MB dan oshmasin).'; return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      if (!S) return;
      S.photo = img;
      var msc = Math.min(1, 4096 / Math.max(img.naturalWidth, img.naturalHeight));   // silliq kattalashtirish uchun
      if (msc < 1) {
        var pc = document.createElement('canvas');
        pc.width = Math.round(img.naturalWidth * msc); pc.height = Math.round(img.naturalHeight * msc);
        var pctx = pc.getContext('2d'); pctx.imageSmoothingQuality = 'high'; pctx.drawImage(img, 0, 0, pc.width, pc.height);
        S.photoSrc = pc;
      } else S.photoSrc = img;
      S.z = 1; S.tx = 0; S.ty = 0; S.markPts = []; S.plane = null; S.pp = null;
      layoutStage();
      enterMark();
    };
    img.onerror = function () { URL.revokeObjectURL(url); err.textContent = "Rasmni ochib bo'lmadi. Boshqa rasm tanlang (JPG yoki PNG)."; };
    img.src = url;
  }

  /* ================================================================ rejimlar */
  function setMode(m) {
    S.mode = m;
    root.classList.toggle('has-panel', m !== 'upload');
    root.classList.toggle('plane-on', !!S.plane);
    $('arStart').hidden = (m !== 'upload');
    $('arPanel').hidden = (m === 'upload');
    $('arStepMark').hidden = (m !== 'mark');
    $('arStepPlace').hidden = (m !== 'place');
    $('arTools').hidden = (m === 'upload');
    $('arBefore').hidden = (m !== 'place');
    Array.prototype.forEach.call($('arStepper').children, function (li) {
      var order = { upload: 1, mark: 2, place: 3 }, me = order[li.getAttribute('data-s')], cur = order[m];
      li.classList.toggle('on', me === cur); li.classList.toggle('done', me < cur);
    });
    updateHint();
    layoutStage();
  }

  function updateHint() {
    var h = $('arHint'); if (!S) return;
    if (S.mode === 'mark') {
      h.hidden = false;
      var n = S.markPts.length;
      h.textContent = n < 4 ? 'Burchakni belgilang: ' + CORNERS[n] + ' (' + (n + 1) + '/4)' : "Burchaklarni sudrab aniqlashtiring, so'ng «Davom etish»";
    } else if (S.mode === 'place') {
      h.hidden = false;
      h.textContent = "Devorning istalgan joyini bosing — oyna o'sha yerga qo'yiladi. Oynani sudrab siljiting.";
    } else h.hidden = true;
  }

  function enterMark() {
    S.markPts = []; S.plane = null; S.pp = null;
    applyPreset('wall');
    $('arPlaneRef').value = 'wall';
    setMode('mark');
    updateMarkUi();
  }

  function applyPreset(k) {
    var P = { door: [90, 200], a4: [21, 29.7], wall: [300, 260] }[k];
    if (P) { $('arPlaneW').value = P[0]; $('arPlaneH').value = P[1]; }
    S.autoH = (k === 'wall');          // devor bo'lagi: bo'yi belgilangan burchaklardan avtomatik hisoblanadi
  }

  // 4 burchakdan to'rtburchakning HAQIQIY nisbatini (bo'yi / eni) baholaydi (perspektivani hisobga olib).
  function estimateRatio(dst) {
    var Hu = solveH([[0, 0], [1, 0], [1, 1], [0, 1]], dst);
    if (!Hu) return null;
    var cx = S.cw / 2, cy = S.ch / 2, m = Math.max(S.cw, S.ch);
    var a1 = Hu[0] - cx * Hu[6], b1 = Hu[3] - cy * Hu[6], c1 = Hu[6];
    var a2 = Hu[1] - cx * Hu[7], b2 = Hu[4] - cy * Hu[7], c2 = Hu[7];
    var f = 0.9 * m;
    if (Math.abs(c1 * c2) > 1e-12) {
      var f2 = -(a1 * a2 + b1 * b2) / (c1 * c2);
      if (f2 > 0) { var fe = Math.sqrt(f2); if (fe > 0.4 * m && fe < 3 * m) f = fe; }
    }
    var n1 = Math.sqrt((a1 * a1 + b1 * b1) / (f * f) + c1 * c1);
    var n2 = Math.sqrt((a2 * a2 + b2 * b2) / (f * f) + c2 * c2);
    if (!(n1 > 0 && n2 > 0)) return null;
    return Math.max(0.05, Math.min(20, n2 / n1));
  }

  function updateMarkUi() {
    var n = S.markPts.length;
    var ok = buildPlane(true);
    $('arMarkStatus').innerHTML = '<b>' + n + ' / 4</b> burchak belgilandi' + (n === 4 && !ok ? ' • <span class="ar-warn">burchaklar noto\'g\'ri joylashgan</span>' : '');
    $('arMarkOk').disabled = !ok;
    updateHint();
    requestRender();
  }

  function confirmMark() {
    if (!buildPlane(true)) return;
    S.plane = S.planeTmp; S.planeTmp = null;
    S.pp = { x: S.plane.w / 2, y: S.plane.h / 2 };
    S.rot = 0; $('arRot').value = 0; $('arRotOut').textContent = '0°';
    autoLight();
    setMode('place');
    S.pp = { x: S.plane.w / 2, y: S.plane.h / 2 };      // oyna belgilangan devorning aynan markaziga
    requestRender();
  }

  // Tez rejim: devorga to'g'ri qaralgan deb olinadi, masshtab "devorning ko'ringan eni" bo'yicha
  function enterQuick() {
    S.plane = null; S.pp = null;
    var base = clamp(2.6 * S.cw / S.ch, 2, 6);                      // rasm balandligi ~2.6 m (odatiy shift)
    var d = Math.max(base, fitDist());
    var sl = $('arDist');
    sl.min = 1; sl.max = Math.max(8, Math.ceil(d * 1.5));
    S.dist = Math.round(d * 10) / 10;
    sl.value = S.dist; $('arDistOut').textContent = S.dist + ' m';
    S.pos = { x: 0.5, y: 0.45 }; S.yaw = 0; S.pitch = 0; S.rot = 0;
    [['arRot', 'arRotOut', '0°'], ['arYaw', 'arYawOut', '0°'], ['arPitch', 'arPitchOut', '0°']].forEach(function (a) { $(a[0]).value = 0; $(a[1]).textContent = a[2]; });
    autoLight();
    setMode('place');
    requestRender();
  }

  // Aniq rejimda oynani devorning o'rtasiga qo'yamiz (ko'rinadigan qismida)
  function placeDefault() {
    if (!S.plane) return;
    var P = S.plane, T = S.tex;
    // belgilangan to'rtburchak markazini ekran markaziga yaqin joyga: kadr markazidagi devor nuqtasi
    var c = applyH(P.inv, S.cw * 0.5, S.ch * 0.42);
    S.pp = { x: c[0], y: c[1] };
    if (!isFinite(S.pp.x) || !isFinite(S.pp.y)) S.pp = { x: P.w / 2, y: P.h / 2 };
  }

  /* ======================================== gomografiya (devor tekisligi) */
  function solveH(src, dst) {
    var A = [], b = [], i, r, c, k;
    for (i = 0; i < 4; i++) {
      var x = src[i][0], y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (c = 0; c < 8; c++) {
      var piv = c;
      for (r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return null;
      var tA = A[c]; A[c] = A[piv]; A[piv] = tA; var tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      for (r = c + 1; r < 8; r++) {
        var f = A[r][c] / A[c][c];
        for (k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    var h = new Array(8);
    for (r = 7; r >= 0; r--) { var s = b[r]; for (k = r + 1; k < 8; k++) s -= A[r][k] * h[k]; h[r] = s / A[r][r]; }
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  function applyH(H, x, y) { var w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }
  function invH(m) {
    var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14) return null;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  // 4 nuqtani soat mili bo'yicha tartiblaydi: [yuqori-chap, yuqori-o'ng, pastki-o'ng, pastki-chap]
  function orderCorners(pts) {
    var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= 4; cy /= 4;
    var sorted = pts.slice().sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    var tl = 0, best = Infinity;
    sorted.forEach(function (p, i) { var s = p[0] + p[1]; if (s < best) { best = s; tl = i; } });
    return [sorted[tl], sorted[(tl + 1) % 4], sorted[(tl + 2) % 4], sorted[(tl + 3) % 4]];
  }

  // Belgilangan 4 nuqta va kiritilgan o'lchamdan devor tekisligini quradi
  function buildPlane(quiet) {
    S.planeTmp = null;
    if (S.markPts.length < 4) return false;
    var w = parseFloat($('arPlaneW').value), h = parseFloat($('arPlaneH').value);
    var dst = orderCorners(S.markPts.map(function (p) { return [p.x * S.cw, p.y * S.ch]; }));
    var ratio = estimateRatio(dst);
    if (ratio) {
      var ref = $('arPlaneRef').value;
      // Eshik/A4 deb tanlangan, lekin belgilangan joy shunga o'xshamasa — devor deb olib, bo'yini o'zi hisoblaymiz.
      if ((ref === 'door' || ref === 'a4') && w > 0 && h > 0 && Math.abs(Math.log(ratio / (h / w))) > 0.35) {
        $('arPlaneRef').value = 'wall'; applyPreset('wall'); w = parseFloat($('arPlaneW').value);
      }
      if (S.autoH && w > 0) {
        h = Math.round(w * ratio);
        if (String($('arPlaneH').value) !== String(h)) $('arPlaneH').value = h;
      }
    }
    if (!(w > 0 && h > 0)) return false;
    // qavariqlik: barcha burilishlar bir tomonga
    for (var i = 0; i < 4; i++) {
      var p0 = dst[i], p1 = dst[(i + 1) % 4], p2 = dst[(i + 2) % 4];
      if ((p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]) <= 1) return false;
    }
    var H = solveH([[0, 0], [w, 0], [w, h], [0, h]], dst);
    if (!H) return false;
    var inv = invH(H);
    if (!inv) return false;
    S.planeTmp = { H: H, inv: inv, w: w, h: h, dst: dst };
    return true;
  }

  /* ===================================================== xona yorug'ligiga moslash */
  function sampleMean(sx, sy, sw, sh) {
    var c = document.createElement('canvas'); c.width = c.height = 24;
    var g = c.getContext('2d');
    var k = S.photoSrc.width / S.cw;
    g.drawImage(S.photoSrc, clamp(sx * k, 0, S.photoSrc.width - 1), clamp(sy * k, 0, S.photoSrc.height - 1), Math.max(1, sw * k), Math.max(1, sh * k), 0, 0, 24, 24);
    var d = g.getImageData(0, 0, 24, 24).data, r = 0, gr = 0, b = 0, n = d.length / 4;
    for (var i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
    return { r: r / n, g: gr / n, b: b / n };
  }
  function autoLight() {
    if (!S.auto || !S.photoSrc) { S.tint = null; return; }
    var rgb;
    try {
      if (S.plane) {
        var xs = S.plane.dst.map(function (p) { return p[0]; }), ys = S.plane.dst.map(function (p) { return p[1]; });
        var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
        rgb = sampleMean(x0, y0, Math.max.apply(null, xs) - x0, Math.max.apply(null, ys) - y0);
      } else rgb = sampleMean(0, 0, S.cw, S.ch);
    } catch (e) { S.tint = null; return; }
    var lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    S.light = clamp(Math.round(58 + 42 * Math.min(1, lum / 185)), 55, 100);   // qorong'i xonada oyna ham biroz qorayadi
    var mx = Math.max(rgb.r, rgb.g, rgb.b) || 1;
    S.tint = [Math.round(rgb.r / mx * 255), Math.round(rgb.g / mx * 255), Math.round(rgb.b / mx * 255)];   // issiq/sovuq yorug'lik rangi
    $('arLight').value = S.light; $('arLightOut').textContent = S.light + '%';
  }

  /* ======================================================== masshtab (tez rejim) */
  function ppc() { return S.cw / (S.dist * 100); }      // 1 sm = necha px (sahna koordinatalarida)
  function fitDist() {
    var T = S.tex;
    var cmPerPx = Math.max(T.wCm / (FIT * S.cw), T.hCm / (FIT * S.ch));
    return cmPerPx * S.cw / 100;
  }

  /* ================================================================== canvas */
  function layoutStage() {
    if (!S || !canvas) return;
    var b = $('arStageBox');
    var box = { w: Math.max(120, b.clientWidth), h: Math.max(120, b.clientHeight) };
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    var w = box.w, h = box.h;
    if (S.photo) {
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
    if (!S || S.raf) return;
    S.raf = requestAnimationFrame(function () { if (S) { S.raf = 0; render(); } });
  }

  function clampView() {
    S.z = clamp(S.z, 1, MAXZ);
    S.tx = clamp(S.tx, S.cw * (1 - S.z), 0);
    S.ty = clamp(S.ty, S.ch * (1 - S.z), 0);
  }
  function syncZoomUi() { var v = $('arZoomVal'); if (v && S) v.textContent = '×' + round1(S.z); }
  function zoomAt(px, py, factor) {
    var sx = (px - S.tx) / S.z, sy = (py - S.ty) / S.z;
    S.z = clamp(S.z * factor, 1, MAXZ);
    S.tx = px - sx * S.z; S.ty = py - sy * S.z;
    clampView(); syncZoomUi(); requestRender();
  }
  function toScene(p) { return { x: (p.x - S.tx) / S.z, y: (p.y - S.ty) / S.z }; }
  function toScreen(x, y) { return [x * S.z + S.tx, y * S.z + S.ty]; }

  function drawBackground() {
    var W = S.cw, H = S.ch;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.fillStyle = '#0b1c2a';
    ctx.fillRect(0, 0, W, H);
    if (!S.photoSrc) return;
    ctx.save();
    ctx.translate(S.tx, S.ty); ctx.scale(S.z, S.z);     // fon ham, oyna ham SHU ko'rinish bilan birga kattalashadi
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.photoSrc, 0, 0, W, H);
    ctx.restore();
  }

  function render() {
    if (!S || !ctx || !S.cw) return;
    drawBackground();
    if (S.mode === 'mark') {
      if (S.markPts.length === 4 && buildPlane(true)) { S.plane = S.planeTmp; S.pp = S.pp || { x: S.plane.w / 2, y: S.plane.h / 2 }; drawPlanePreview(); S.plane = null; S.pp = null; }
      drawMarks();
    } else if (S.mode === 'place' && !S.before) drawGlass(ctx);
  }

  function pill(c, text, x, y) {
    c.save();
    c.font = '700 13px Manrope, system-ui, sans-serif';
    var tw = c.measureText(text).width + 20;
    var px = clamp(x, tw / 2 + 4, S.cw - tw / 2 - 4), py = clamp(y, 16, S.ch - 16);
    var r = 12, x0 = px - tw / 2, y0 = py - 12, h = 24;
    c.fillStyle = 'rgba(8,24,38,.86)';
    c.beginPath();
    c.moveTo(x0 + r, y0); c.arcTo(x0 + tw, y0, x0 + tw, y0 + h, r); c.arcTo(x0 + tw, y0 + h, x0, y0 + h, r);
    c.arcTo(x0, y0 + h, x0, y0, r); c.arcTo(x0, y0, x0 + tw, y0, r); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, px, py + 1);
    c.restore();
  }

  /* ============================================================ devorni belgilash chizmasi */
  function drawPlanePreview() { drawGlass(ctx, true); }

  function drawMarks() {
    var pts = S.markPts.map(function (p) { return toScreen(p.x * S.cw, p.y * S.ch); });
    if (!pts.length) return;
    ctx.save();
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    var order = pts.length === 4 ? orderCorners(pts) : pts;
    ctx.lineJoin = 'round';
    if (pts.length > 1) {
      ctx.beginPath(); ctx.moveTo(order[0][0], order[0][1]);
      for (var i = 1; i < order.length; i++) ctx.lineTo(order[i][0], order[i][1]);
      if (pts.length === 4) ctx.closePath();
      if (pts.length === 4) { ctx.fillStyle = 'rgba(255,210,74,.10)'; ctx.fill(); }
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
    }
    pts.forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 15, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, Math.PI * 2); ctx.fillStyle = '#ffd24a'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#0b1c2a'; ctx.font = '800 12px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), p[0], p[1] + 0.5);
    });
    // Lupa: burchakni sudrab turganda aniq joylashtirish uchun
    if (S.drag && S.drag.t === 'handle' && S.photoSrc) {
      var hp = pts[S.drag.i], R = 56, lx = clamp(hp[0], R + 6, S.cw - R - 6), ly = hp[1] - R - 34;
      if (ly < R + 6) ly = hp[1] + R + 34;
      var k = S.photoSrc.width / S.cw, sx = (hp[0] - S.tx) / S.z, sy = (hp[1] - S.ty) / S.z, half = (R / 3.2) / S.z;
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(S.photoSrc, (sx - half) * k, (sy - half) * k, 2 * half * k, 2 * half * k, lx - R, ly - R, 2 * R, 2 * R);
      ctx.restore();
      ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd24a';
      ctx.beginPath(); ctx.moveTo(lx - 14, ly); ctx.lineTo(lx + 14, ly); ctx.moveTo(lx, ly - 14); ctx.lineTo(lx, ly + 14); ctx.stroke();
    }
    ctx.restore();
  }

  /* ============================================================= 3D proyeksiya (tez rejim) */
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

  // Devor tekisligidagi (sm) nuqta -> ekran. u,v in [0..1] oyna yuzida; rot — devor tekisligidagi burilish.
  function makePlaneProjector(T) {
    var P = S.plane, r = S.rot * Math.PI / 180, cr = Math.cos(r), sr = Math.sin(r);
    return function (u, v) {
      var x = (u - 0.5) * T.wCm, y = (v - 0.5) * T.hCm;
      var q = applyH(P.H, S.pp.x + x * cr - y * sr, S.pp.y + x * sr + y * cr);
      return toScreen(q[0], q[1]);
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

  // Katta tekstura "mip" darajalari (kichraytirganda tishlanmasin)
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

  function grainPattern() {
    if (noisePat) return noisePat;
    var c = document.createElement('canvas'); c.width = c.height = 96;
    var g = c.getContext('2d'), im = g.createImageData(96, 96);
    for (var i = 0; i < im.data.length; i += 4) { var v = 110 + Math.random() * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0);
    noisePat = octx.createPattern(c, 'repeat');
    return noisePat;
  }

  function drawGlass(target) {
    var T = S.tex; if (!T) return;
    var planeMode = !!(S.plane && S.pp);
    var P, W, H, cx, cy, tilted, th = 0, back = null;
    var q;
    if (planeMode) {
      P = makePlaneProjector(T);
      q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
      W = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]); H = Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]);
      cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4; cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
      tilted = true;
    } else {
      var k = ppc() * S.z;
      W = T.wCm * k; H = T.hCm * k;
      cx = S.pos.x * S.cw * S.z + S.tx; cy = S.pos.y * S.ch * S.z + S.ty;
      P = makeProjector(cx, cy, W, H, S.rot, S.yaw, S.pitch);
      q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
      tilted = !!(S.yaw || S.pitch);
      th = Math.max(1.5, THICK_CM * k);
      back = tilted ? [P(0, 0, th), P(1, 0, th), P(1, 1, th), P(0, 1, th)] : null;
    }
    if (!(W > 1 && H > 1)) return;
    S.quad = q;

    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    q.concat(back || []).forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var blur = Math.min(36, Math.max(8, Math.min(W, H) * 0.06));
    var pad = Math.ceil(blur * 2.2);
    var x0 = Math.max(Math.floor(minX - pad), -pad), y0 = Math.max(Math.floor(minY - pad), -pad);
    var x1 = Math.min(Math.ceil(maxX + pad), S.cw + pad), y1 = Math.min(Math.ceil(maxY + pad), S.ch + pad);
    if (x1 <= x0 || y1 <= y0) return;
    var bx = x0, by = y0, bw = x1 - x0, bh = y1 - y0;

    var dpr = S.dpr;
    var ow = Math.max(1, Math.round(bw * dpr)), oh = Math.max(1, Math.round(bh * dpr));
    if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.globalAlpha = 1;
    octx.clearRect(0, 0, off.width, off.height);
    octx.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';

    if (back) {   // shisha qalinligi: har bir panelning yon qirralari
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

    var tc = pickLevel(T, W * dpr);
    if (!tilted) {
      octx.save();
      octx.translate(cx, cy); octx.rotate(S.rot * Math.PI / 180);
      octx.drawImage(tc, -W / 2, -H / 2, W, H);
      octx.restore();
    } else {
      var N = planeMode ? 20 : 14, tw = tc.width, thp = tc.height, g = [], i, j;
      for (j = 0; j <= N; j++) { g[j] = []; for (i = 0; i <= N; i++) g[j][i] = { d: P(i / N, j / N), s: [i / N * tw, j / N * thp] }; }
      for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
        var p00 = g[j][i], p10 = g[j][i + 1], p11 = g[j + 1][i + 1], p01 = g[j + 1][i];
        drawTri(octx, tc, p00.s, p10.s, p11.s, p00.d, p10.d, p11.d);
        drawTri(octx, tc, p00.s, p11.s, p01.s, p00.d, p11.d, p01.d);
      }
    }

    // Realistiklik: yorug' aks, xona yorug'ligi/rangi, fotosurat "doni" — faqat oyna piksellariga
    octx.globalCompositeOperation = 'source-atop';
    var gr = octx.createLinearGradient(q[0][0], q[0][1], q[2][0], q[2][1]);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.38, 'rgba(255,255,255,0.00)');
    gr.addColorStop(0.52, 'rgba(255,255,255,0.20)');
    gr.addColorStop(0.64, 'rgba(255,255,255,0.00)');
    gr.addColorStop(1, 'rgba(255,255,255,0.06)');
    octx.fillStyle = gr; octx.fillRect(bx, by, bw, bh);
    if (S.tint && S.auto) { octx.fillStyle = 'rgba(' + S.tint[0] + ',' + S.tint[1] + ',' + S.tint[2] + ',0.12)'; octx.fillRect(bx, by, bw, bh); }
    if (S.light < 100) { octx.fillStyle = 'rgba(0,0,0,' + ((100 - S.light) / 100 * 0.75).toFixed(3) + ')'; octx.fillRect(bx, by, bw, bh); }
    var np = grainPattern();
    if (np) { octx.globalAlpha = 0.045; octx.fillStyle = np; octx.fillRect(bx, by, bw, bh); octx.globalAlpha = 1; }
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

    if (S.showDim && S.mode === 'place') {
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

  /* ================================================================ pointer */
  function pointer(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (S.cw / r.width), y: (e.clientY - r.top) * (S.ch / r.height) };
  }
  function startPinch() {
    var ids = Object.keys(S.ptrs).slice(0, 2), a = S.ptrs[ids[0]], b = S.ptrs[ids[1]];
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
  function planePoint(p) {            // ekran nuqtasi -> devor tekisligi (sm)
    var sc = toScene(p), q = applyH(S.plane.inv, sc.x, sc.y);
    return { x: q[0], y: q[1] };
  }

  function onDown(e) {
    if (!S || (S.mode !== 'place' && S.mode !== 'mark')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    var p = pointer(e);
    S.ptrs[e.pointerId] = p;
    if (Object.keys(S.ptrs).length >= 2) { S.drag = null; startPinch(); return; }
    if (S.mode === 'mark') {
      var hit = -1, best = 30;
      S.markPts.forEach(function (m, i) { var sp = toScreen(m.x * S.cw, m.y * S.ch), d = Math.hypot(sp[0] - p.x, sp[1] - p.y); if (d < best) { best = d; hit = i; } });
      if (hit >= 0) S.drag = { t: 'handle', i: hit };
      else S.drag = { t: 'bg', sx: p.x, sy: p.y, tx: S.tx, ty: S.ty, moved: false };
      requestRender();
      return;
    }
    if (pointInQuad(p)) {
      if (S.plane) { var pp = planePoint(p); S.drag = { t: 'glass', dx: S.pp.x - pp.x, dy: S.pp.y - pp.y }; }
      else { var sc = toScene(p); S.drag = { t: 'glass', dx: S.pos.x * S.cw - sc.x, dy: S.pos.y * S.ch - sc.y }; }
    } else S.drag = { t: 'bg', sx: p.x, sy: p.y, tx: S.tx, ty: S.ty, moved: false };
  }
  function onMove(e) {
    if (!S) return;
    var p = pointer(e);
    if (S.ptrs[e.pointerId]) S.ptrs[e.pointerId] = p;
    if (S.pinch) { updatePinch(); return; }
    var d = S.drag; if (!d) return;
    if (d.t === 'handle') {
      var sc0 = toScene(p);
      S.markPts[d.i] = { x: clamp(sc0.x / S.cw, 0, 1), y: clamp(sc0.y / S.ch, 0, 1) };
      updateMarkUi();
      return;
    }
    if (d.t === 'glass') {
      if (S.plane) { var pp = planePoint(p); S.pp.x = pp.x + d.dx; S.pp.y = pp.y + d.dy; }
      else { var sc = toScene(p); S.pos.x = clamp((sc.x + d.dx) / S.cw, 0, 1); S.pos.y = clamp((sc.y + d.dy) / S.ch, 0, 1); }
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
    if (d && d.t === 'bg' && !d.moved && !S.pinch) {            // oddiy bosish
      var sc = toScene(pointer(e));
      if (S.mode === 'mark') {
        if (S.markPts.length < 4) { S.markPts.push({ x: clamp(sc.x / S.cw, 0, 1), y: clamp(sc.y / S.ch, 0, 1) }); updateMarkUi(); }
      } else if (S.plane) {
        var pp = planePoint(pointer(e)); S.pp.x = pp.x; S.pp.y = pp.y; requestRender();     // oyna o'sha devor nuqtasiga
      } else { S.pos.x = clamp(sc.x / S.cw, 0, 1); S.pos.y = clamp(sc.y / S.ch, 0, 1); requestRender(); }
    }
    delete S.ptrs[e.pointerId];
    if (Object.keys(S.ptrs).length < 2) S.pinch = null;
    S.drag = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
    if (S.mode === 'mark') requestRender();
  }
  function onWheel(e) {
    if (!S || S.mode === 'upload') return;
    e.preventDefault();
    var p = pointer(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  }

  /* ================================================================ saqlash */
  async function save() {
    if (!S || S.mode !== 'place') return;
    S.before = false; render();
    var out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    var g = out.getContext('2d');
    g.drawImage(canvas, 0, 0);
    var fs = Math.max(12, Math.round(out.width * 0.017));      // nozik belgi (watermark)
    g.font = '700 ' + fs + 'px Manrope, system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(255,255,255,0.62)'; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = fs * 0.5;
    g.fillText('Laminated Glasses', out.width - fs, out.height - fs * 0.8);
    var blob = await new Promise(function (res) { out.toBlob(res, 'image/jpeg', 0.95); });
    if (!blob) { toast("Rasmni saqlab bo'lmadi.", true); return; }
    var name = 'oyna-xonamda-' + new Date().toISOString().slice(0, 10) + '.jpg';
    try {
      var file = new File([blob], name, { type: 'image/jpeg' });
      if (window.matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
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

  /* ============================================================== tadbirlar */
  function bind() {
    $('arClose').addEventListener('click', close);
    var drop = $('arDrop');
    drop.addEventListener('click', function () { $('arFile').value = ''; $('arFile').click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.click(); } });
    $('arFile').addEventListener('change', function (e) { loadPhoto(e.target.files && e.target.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) { root.addEventListener(ev, function (e) { if (S && S.mode === 'upload') { e.preventDefault(); drop.classList.add('over'); } }); });
    ['dragleave', 'drop'].forEach(function (ev) { root.addEventListener(ev, function (e) { drop.classList.remove('over'); }); });
    root.addEventListener('drop', function (e) { if (S && S.mode === 'upload') { e.preventDefault(); loadPhoto(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); } });
    document.addEventListener('paste', function (e) {
      if (!S || !root || root.hidden) return;
      var items = (e.clipboardData && e.clipboardData.files) || [];
      if (items.length && /^image\//.test(items[0].type)) { e.preventDefault(); loadPhoto(items[0]); }
    });

    // 2-qadam
    $('arPlaneRef').addEventListener('change', function (e) { applyPreset(e.target.value); updateMarkUi(); });
    $('arPlaneW').addEventListener('input', function () {
      var r = $('arPlaneRef').value;
      if (r !== 'wall') { $('arPlaneRef').value = 'custom'; S.autoH = false; }
      updateMarkUi();
    });
    $('arPlaneH').addEventListener('input', function () { $('arPlaneRef').value = 'custom'; S.autoH = false; updateMarkUi(); });
    $('arMarkClear').addEventListener('click', function () { S.markPts = []; updateMarkUi(); });
    $('arMarkOk').addEventListener('click', confirmMark);
    $('arMarkSkip').addEventListener('click', enterQuick);

    // 3-qadam
    $('arSave').addEventListener('click', save);
    $('arNewPhoto').addEventListener('click', function () { S.photo = null; S.photoSrc = null; S.plane = null; S.markPts = []; layoutStage(); setMode('upload'); });
    $('arPlaneBtn').addEventListener('click', function () { var keep = S.photo; enterMark(); });
    $('arMoreBtn').addEventListener('click', function () {
      var m = $('arMore'), open = !m.classList.contains('open');
      m.classList.toggle('open', open); this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('arResetAdj').addEventListener('click', function () {
      S.rot = 0; S.yaw = 0; S.pitch = 0; autoLight();
      [['arRot', 'arRotOut', '0°'], ['arYaw', 'arYawOut', '0°'], ['arPitch', 'arPitchOut', '0°']].forEach(function (a) { $(a[0]).value = 0; $(a[1]).textContent = a[2]; });
      if (!S.auto || !S.tint) { S.light = 100; $('arLight').value = 100; $('arLightOut').textContent = '100%'; }
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
    $('arAuto').addEventListener('change', function (e) {
      S.auto = e.target.checked;
      if (S.auto) autoLight(); else { S.tint = null; S.light = 100; $('arLight').value = 100; $('arLightOut').textContent = '100%'; }
      requestRender();
    });

    // Oldin / Keyin — bosib turish
    var bf = $('arBefore');
    function setBefore(v) { if (S) { S.before = v; bf.classList.toggle('on', v); requestRender(); } }
    bf.addEventListener('pointerdown', function (e) { e.preventDefault(); setBefore(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { bf.addEventListener(ev, function () { setBefore(false); }); });

    // Ko'rinish
    $('arZoomIn').addEventListener('click', function () { if (S) zoomAt(S.cw / 2, S.ch / 2, 1.4); });
    $('arZoomOutBtn').addEventListener('click', function () { if (S) zoomAt(S.cw / 2, S.ch / 2, 1 / 1.4); });
    $('arZoomReset').addEventListener('click', function () { if (S) { S.z = 1; S.tx = 0; S.ty = 0; syncZoomUi(); requestRender(); } });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    if (window.ResizeObserver) new ResizeObserver(function () { if (S && root && !root.hidden) layoutStage(); }).observe($('arStageBox'));
    window.addEventListener('resize', function () { if (S && root && !root.hidden) layoutStage(); });
    document.addEventListener('keydown', function (e) {
      if (!S || !root || root.hidden) return;
      var tag = (e.target && e.target.tagName) || '';
      if (e.key === 'Escape') { close(); return; }
      if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if (S.mode === 'upload') return;
      if (e.key === '+' || e.key === '=') zoomAt(S.cw / 2, S.ch / 2, 1.3);
      else if (e.key === '-') zoomAt(S.cw / 2, S.ch / 2, 1 / 1.3);
      else if (e.key === '0') { S.z = 1; S.tx = 0; S.ty = 0; syncZoomUi(); requestRender(); }
      else if ((e.key === 'b' || e.key === 'B') && S.mode === 'place' && !S.before) { S.before = true; $('arBefore').classList.add('on'); requestRender(); }
    });
    document.addEventListener('keyup', function (e) {
      if (S && (e.key === 'b' || e.key === 'B') && S.before) { S.before = false; $('arBefore').classList.remove('on'); requestRender(); }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = $('constructorArBtn');
    if (btn) btn.addEventListener('click', open);
  });

  window.lgArRoom = { open: open, close: close };
})();
