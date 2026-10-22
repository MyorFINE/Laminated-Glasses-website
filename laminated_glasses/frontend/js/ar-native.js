/* Laminated Glasses — HAQIQIY AR (devor tekisligini aniqlash, devorga biriktirish).
 *
 *  • Android (Chrome, ARCore): WebXR immersive-ar + hit-test (+ anchors) — three.js bilan.
 *  • iPhone/iPad: AR Quick Look — USDZ modeli brauzerning o'zida yasaladi,
 *    "vertikal tekislik" (devor) ga biriktirish belgilanadi.
 *
 * Bu modul faqat kerak bo'lganda yuklanadi (ar-room.js import() qiladi) va three.js'ni
 * constructor.html dagi import map orqali oladi.
 *
 * Fizik model (hammasi santimetrda kiritiladi, three.js'da metr):
 *   devor tekisligi z = 0; panel orqasi z = standoff; panel qalinligi `thick`;
 *   oldingi yuz z = standoff + thick. Panellar orasida `gap`. Markaz = butun asarning markazi.
 */
import * as THREE from 'three';

const CM = 0.01;

function labelTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(6,28,44,0.86)';
  const r = 44; g.beginPath();
  g.moveTo(r, 4); g.arcTo(508, 4, 508, 92, r); g.arcTo(508, 92, 4, 92, r); g.arcTo(4, 92, 4, 4, r); g.arcTo(4, 4, 508, 4, r); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.font = '700 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.60)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/* spec = { panes: [{ canvas, wCm, hCm }], label }, o = { gapCm, thickCm, standoffCm } */
export function buildArtwork(spec, o, flags) {
  const f = Object.assign({ shadows: false, label: false }, flags || {});
  const group = new THREE.Group();
  const gap = o.gapCm * CM, th = o.thickCm * CM, so = o.standoffCm * CM;
  const widths = spec.panes.map(p => p.wCm * CM), heights = spec.panes.map(p => p.hCm * CM);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (spec.panes.length - 1);
  const maxH = Math.max(...heights);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xcfe9e3, roughness: 0.3, metalness: 0 });
  const shTex = f.shadows ? shadowTexture() : null;
  const disposables = [edgeMat];
  let x = -total / 2;

  spec.panes.forEach((p, i) => {
    const w = widths[i], h = heights[i];
    const tex = new THREE.CanvasTexture(p.canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
    const frontMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), frontMat);
    front.position.set(x + w / 2, 0, so + th + 0.0005);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, th), edgeMat);
    body.position.set(x + w / 2, 0, so + th / 2);
    group.add(body, front);
    disposables.push(tex, frontMat, front.geometry, body.geometry);

    if (f.shadows) {   // devorga tushadigan yumshoq soya (devordan masofa kattaroq bo'lsa, soya kuchliroq)
      const sw = w + 0.09 + so * 3, sh = h + 0.09 + so * 3;
      const sMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, opacity: Math.min(0.9, 0.45 + so * 6) });
      const sh_ = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), sMat);
      sh_.position.set(x + w / 2 + 0.008, -0.014 - so * 0.5, 0.0015);
      sh_.renderOrder = -1;
      group.add(sh_);
      disposables.push(sMat, sh_.geometry);
    }
    x += w + gap;
  });

  if (f.label) {      // masshtab ko'rsatkichi: haqiqiy o'lcham yozuvi
    const wCm = Math.round(total / CM * 10) / 10, hCm = Math.round(maxH / CM * 10) / 10;
    const lt = labelTexture(wCm + ' × ' + hCm + ' sm');
    const lm = new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false });
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.056), lm);
    lbl.position.set(0, -maxH / 2 - 0.07, so + th + 0.002);
    group.add(lbl);
    disposables.push(lt, lm, lbl.geometry);
  }
  if (shTex) disposables.push(shTex);
  return { group, total, maxH, dispose() { disposables.forEach(d => d.dispose && d.dispose()); } };
}

/* ---------------------------------------------------------------- iPhone / iPad */
export async function buildQuickLookUrl(spec, o) {
  const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
  const scene = new THREE.Scene();
  const art = buildArtwork(spec, o, { shadows: false, label: false });
  scene.add(art.group);
  const exporter = new USDZExporter();
  const options = {
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'vertical' } },   // DEVORGA biriktirish
    quickLookCompatible: true,
    maxTextureSize: 4096,
  };
  let data = exporter.parse(scene, options);
  if (data && typeof data.then === 'function') data = await data;
  art.dispose();
  const blob = new Blob([data], { type: 'model/vnd.usdz+zip' });
  return URL.createObjectURL(blob);
}

/* ---------------------------------------------------------------- Android (WebXR) */
export async function launchWebXR(spec, o) {
  const art = buildArtwork(spec, o, { shadows: true, label: true });
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false; holder.visible = false;
  holder.add(art.group);

  const scene = new THREE.Scene();
  scene.add(holder);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.0));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(0.5, 1, 1); scene.add(dl);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2), ringMat);
  reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

  const camera = new THREE.PerspectiveCamera();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  const cv = renderer.domElement; cv.className = 'ar-xr-canvas';
  document.body.appendChild(cv);

  const ui = document.createElement('div');
  ui.className = 'ar-xr-ui';
  ui.innerHTML =
    '<div class="ar-xr-status" id="arXrStatus"></div>' +
    '<div class="ar-xr-bar" id="arXrBar" hidden>' +
      '<label>Balandlik <output id="arXrHOut">0 sm</output><input type="range" id="arXrH" min="-100" max="100" step="1" value="0"></label>' +
      '<div class="ar-xr-btns"><button type="button" id="arXrReset">Qayta qo\'yish</button><button type="button" id="arXrClose">Yopish</button></div>' +
    '</div>' +
    '<button type="button" class="ar-xr-x" id="arXrX" aria-label="Yopish">✕</button>';
  document.body.appendChild(ui);
  ui.addEventListener('beforexrselect', e => e.preventDefault());
  const $ = id => ui.querySelector('#' + id);
  const setStatus = t => { $('arXrStatus').textContent = t; };
  const HINT_SCAN = "1) Telefonni sekin harakatlantirib devorni skanerlang. 2) Halqa yashil bo'lganda ekranni bosing — oyna o'sha joyga o'rnatiladi.";

  let session = null, hitSource = null, lastHit = null, placed = false, anchor = null, offset = null;
  const placedMat = new THREE.Matrix4();
  let done;
  const finished = new Promise(r => { done = r; });

  function cleanup() {
    try { renderer.setAnimationLoop(null); } catch (e) {}
    try { renderer.dispose(); } catch (e) {}
    art.dispose(); ringMat.dispose(); reticle.geometry.dispose();
    cv.remove(); ui.remove();
    done();
  }

  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'anchors'],
      domOverlay: { root: ui },
    });
  } catch (e) { cleanup(); throw e; }

  session.addEventListener('end', () => { hitSource = null; cleanup(); });
  await renderer.xr.setSession(session);
  const viewerSpace = await session.requestReferenceSpace('viewer');
  try { hitSource = await session.requestHitTestSource({ space: viewerSpace, entityTypes: ['plane'] }); }
  catch (e) { hitSource = await session.requestHitTestSource({ space: viewerSpace }); }
  setStatus(HINT_SCAN);

  const endSession = () => { try { session.end(); } catch (e) {} };
  $('arXrClose').addEventListener('click', endSession);
  $('arXrX').addEventListener('click', endSession);
  $('arXrReset').addEventListener('click', () => {
    placed = false; holder.visible = false; offset = null;
    if (anchor && anchor.delete) { try { anchor.delete(); } catch (e) {} }
    anchor = null; $('arXrBar').hidden = true; setStatus(HINT_SCAN);
  });
  $('arXrH').addEventListener('input', e => {
    const v = Number(e.target.value);
    art.group.position.y = v * CM;                 // devor bo'ylab yuqoriga/pastga
    $('arXrHOut').textContent = v + ' sm';
  });

  const up = new THREE.Vector3(0, 1, 0);
  session.addEventListener('select', ev => {
    if (!lastHit) { setStatus("Devor topilmadi. Telefonni devorga qarating va sekin harakatlantiring."); return; }
    if (!lastHit.wall) { setStatus("Bu sirt devor emas (pol yoki shift). Devorga qarating — halqa yashil bo'lishi kerak."); return; }
    // Devor bazisi: z = devor normali (xonaga qarab), y = dunyo "tepasi" devor tekisligiga proyeksiyada, x = y × z
    const n = lastHit.n.clone();
    const yA = up.clone().sub(n.clone().multiplyScalar(up.dot(n))).normalize();
    const xA = new THREE.Vector3().crossVectors(yA, n).normalize();
    placedMat.makeBasis(xA, yA, n).setPosition(lastHit.p);
    holder.matrix.copy(placedMat);
    holder.visible = true; placed = true; offset = null;
    // Biriktirish (anchor): kuzatuv siljiganda ham oyna devorda qoladi
    if (anchor && anchor.delete) { try { anchor.delete(); } catch (e) {} }
    anchor = null;
    if (lastHit.hit && lastHit.hit.createAnchor) {
      lastHit.hit.createAnchor().then(a => { anchor = a; }).catch(() => { anchor = null; });
    }
    $('arXrBar').hidden = false;
    setStatus("Oyna devorga haqiqiy o'lchamda o'rnatildi. Boshqa joyga qo'yish uchun yana bosing.");
  });

  const m = new THREE.Matrix4(), A = new THREE.Matrix4();
  renderer.setAnimationLoop((t, frame) => {
    if (frame && hitSource) {
      const refSpace = renderer.xr.getReferenceSpace();
      const results = frame.getHitTestResults(hitSource);
      if (results.length) {
        const hit = results[0], pose = hit.getPose(refSpace);
        if (pose) {
          m.fromArray(pose.transform.matrix);
          const p = new THREE.Vector3().setFromMatrixPosition(m);
          const n = new THREE.Vector3(m.elements[4], m.elements[5], m.elements[6]).normalize();   // hit pozasining Y o'qi = sirt normali
          const vp = frame.getViewerPose(refSpace);
          if (vp) {
            const cp = vp.transform.position;
            if (n.dot(new THREE.Vector3(cp.x - p.x, cp.y - p.y, cp.z - p.z)) < 0) n.negate();    // normal kamera tomonga qaralsin
          }
          const wall = Math.abs(n.y) < 0.35;                                                      // normal gorizontalga yaqin = vertikal devor
          ringMat.color.set(wall ? 0x47e08b : 0xff6b5b);
          reticle.matrix.copy(m); reticle.visible = true;
          lastHit = { hit, p, n, wall };
        }
      } else { reticle.visible = false; lastHit = null; }

      if (placed && anchor) {
        const ap = frame.getPose(anchor.anchorSpace, refSpace);
        if (ap) {
          A.fromArray(ap.transform.matrix);
          if (!offset) offset = A.clone().invert().multiply(placedMat);
          holder.matrix.copy(A).multiply(offset);
        }
      }
    }
    renderer.render(scene, camera);
  });
  return finished;
}
