/* Laminated Glasses — navigatsiya boshqaruvi.
   1) Desktop: suyuq shisha linza faol bo'limga ko'chib o'tadi, keyin sahifa ochiladi.
   2) Profil/savat kapsulasi: linza sichqoncha ostidagi tugmaga siljiydi
      (savat ochiq bo'lsa savatda "ushlanib" turadi).
   3) Telefon: burger tugma va yuqoridan ochiladigan shisha menyu.
   main.js'dan mustaqil ishlaydi. */
(function () {
  "use strict";

  var BP = 960;
  var NAV_DELAY = 0; // sahifaga DARHOL o'tiladi; linza animatsiyasi yuklanish paytida davom etadi
  var doc = document;
  var $ = function (id) { return doc.getElementById(id); };
  var reduce = function () {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  var header = doc.querySelector(".site-header");
  var nav = $("lgNav");
  var tools = $("lgTools");
  var navigating = false;

  function currentPath() {
    var p = "/";
    try { p = decodeURI(location.pathname); } catch (_) { p = location.pathname; }
    p = p.replace(/\/+$/, "");
    return p || "/";
  }

  function findActive(links) {
    var path = currentPath();
    for (var i = 0; i < links.length; i++) {
      var list = (links[i].getAttribute("data-match") || "").split(",");
      if (list.indexOf(path) !== -1) return i;
    }
    return -1;
  }

  function go(href) {
    if (navigating) return;
    navigating = true;
    prefetch(href);
    var run = function () { location.href = href; };
    if (reduce() || NAV_DELAY <= 0) run(); else window.setTimeout(run, NAV_DELAY);
  }

  // Sahifani sichqoncha ustiga kelganda/bosganda oldindan yuklab qo'yish.
  var prefetched = {};
  function prefetch(href) {
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin || prefetched[u.pathname]) return;
      prefetched[u.pathname] = 1;
      var l = doc.createElement("link");
      l.rel = "prefetch"; l.as = "document"; l.href = u.href;
      doc.head.appendChild(l);
    } catch (_) { /* e'tiborsiz */ }
  }

  function plainClick(e, a) {
    return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank");
  }

  /* ---------- Suyuq tomchi: prujina fizikasi ----------
     x/w — joy va kenglik (ikkalasi ham prujinada, shuning uchun tomchi biroz
     o'tib ketib, orqaga qaytib o'rnashadi). Tezlikka qarab harakat yo'nalishida
     cho'ziladi (hajm saqlanadi: kengayganda balandligi kamayadi), yon tomonga
     egiladi, yaltiroq chiziq esa inertsiya bilan orqada qoladi. Bosilganda ezilib,
     qo'yib yuborilganda qaytadi. */
  function Drop(el) {
    var s = { x: 0, w: 0, vx: 0, vw: 0, tx: 0, tw: 0, pr: 0, pv: 0, pt: 0 };
    var raf = 0, last = 0, onFrame = null;
    var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

    function paint() {
      var sp = s.vx;
      var stretch = clamp(Math.abs(sp) / 2800, 0, 0.38) + clamp(Math.abs(s.vw) / 3200, 0, 0.12);
      var sx = 1 + stretch * 0.85 + s.pr * 0.07;
      var sy = 1 - stretch * 0.42 - s.pr * 0.1;
      el.style.setProperty("--lx", s.x.toFixed(2) + "px");
      el.style.setProperty("--lw", Math.max(0, s.w).toFixed(2) + "px");
      el.style.setProperty("--sx", sx.toFixed(4));
      el.style.setProperty("--sy", sy.toFixed(4));
      el.style.setProperty("--sk", clamp(-sp / 260, -9, 9).toFixed(2) + "deg");
      el.style.setProperty("--hl", clamp(-sp / 120, -10, 10).toFixed(2) + "px");
      if (onFrame) onFrame(s);
    }

    function step(t) {
      var dt = Math.min((t - last) / 1000, 1 / 30);
      last = t;
      if (dt <= 0) dt = 1 / 60;
      s.vx += (320 * (s.tx - s.x) - 25 * s.vx) * dt;  s.x += s.vx * dt;
      s.vw += (380 * (s.tw - s.w) - 29 * s.vw) * dt;  s.w += s.vw * dt;
      s.pv += (420 * (s.pt - s.pr) - 26 * s.pv) * dt; s.pr += s.pv * dt;
      var rest = Math.abs(s.tx - s.x) < 0.04 && Math.abs(s.vx) < 0.5 &&
                 Math.abs(s.tw - s.w) < 0.04 && Math.abs(s.vw) < 0.5 &&
                 Math.abs(s.pt - s.pr) < 0.002 && Math.abs(s.pv) < 0.05;
      if (rest) { s.x = s.tx; s.w = s.tw; s.vx = s.vw = 0; s.pr = s.pt; s.pv = 0; raf = 0; paint(); return; }
      paint();
      raf = window.requestAnimationFrame(step);
    }
    function run() { if (!raf) { last = performance.now(); raf = window.requestAnimationFrame(step); } }

    return {
      onFrame: function (fn) { onFrame = fn; },
      snap: function (x, w) {
        s.x = s.tx = x; s.w = s.tw = w; s.vx = s.vw = 0; paint();
      },
      to: function (x, w) {
        s.tx = x; s.tw = w;
        if (reduce()) { this.snap(x, w); return; }
        run();
      },
      press: function (on) {
        s.pt = on ? 1 : 0;
        if (reduce()) { s.pr = s.pt; paint(); return; }
        run();
      },
      moving: function () { return !!raf; }
    };
  }

  /* ---------- Desktop kapsula ---------- */
  if (nav) {
    var items = [].slice.call(nav.querySelectorAll(".lg-nav-item"));
    var lens = nav.querySelector(".lg-lens");
    var label = $("lgLensLabel");
    var drop = Drop(lens);
    var active = findActive(items);
    var prev = active;
    var coveredIdx = -2, labelIdx = -2, hov = -1;

    var geom = function (el) { return { x: el.offsetLeft, w: el.offsetWidth }; };
    var centerOf = function (i) { return items[i].offsetLeft + items[i].offsetWidth / 2; };

    // Tomchi qaysi bo'lim ustida bo'lsa, o'sha bo'lim yozuvi tomchining ichida ko'rinadi.
    drop.onFrame(function (st) {
      var cands = [];
      [active, prev, hov].forEach(function (i) { if (i >= 0 && cands.indexOf(i) === -1) cands.push(i); });
      if (!cands.length) return;
      var cx = st.x + st.w / 2, near = cands[0], nd = 1e9, cov = -1;
      cands.forEach(function (i) {
        var d = Math.abs(cx - centerOf(i));
        if (d < nd) { nd = d; near = i; }
      });
      if (nd < items[near].offsetWidth * 0.46) cov = near;
      if (cov !== coveredIdx) {
        coveredIdx = cov;
        items.forEach(function (a, k) { a.classList.toggle("is-cov", k === cov); });
      }
      if (near !== labelIdx) {
        labelIdx = near;
        if (label) label.textContent = items[near].textContent.trim();
      }
    });

    var mark = function () {
      items.forEach(function (a, k) {
        if (k === active) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
    };

    var settle = function () {
      if (active < 0 || !items[active]) { nav.classList.remove("is-ready"); return; }
      prev = active;
      mark();
      var g = geom(items[active]);
      drop.snap(g.x, g.w);
      nav.classList.add("is-ready");
    };
    settle();

    var refit = function () {
      if (active < 0) return;
      var g = geom(items[active]);
      if (drop.moving()) drop.to(g.x, g.w); else drop.snap(g.x, g.w);
    };

    // Sichqoncha bilan harakatlanganda linza ostidagi bo'limga ergashadi,
    // chiqib ketsa faol bo'limga qaytadi (profil/savat kapsulasidagi kabi).
    var hoverTo = function (i) {
      if (!items[i]) return;
      hov = i;
      var g = geom(items[i]);
      if (!nav.classList.contains("is-ready")) { drop.snap(g.x, g.w); nav.classList.add("is-ready"); }
      else drop.to(g.x, g.w);
    };
    var hoverOff = function () {
      hov = -1;
      if (active >= 0 && items[active]) { var g = geom(items[active]); drop.to(g.x, g.w); }
      else nav.classList.remove("is-ready");
    };

    var select = function (i) {
      prev = active;
      active = i;
      hov = i;
      mark();
      var g = geom(items[i]);
      drop.press(false);
      drop.to(g.x, g.w);
    };

    items.forEach(function (a, i) {
      a.addEventListener("pointerenter", function (e) { if (e.pointerType !== "touch") { hoverTo(i); prefetch(a.href); } });
      a.addEventListener("focus", function () { if (a.matches && a.matches(":focus-visible")) hoverTo(i); });
      a.addEventListener("pointerdown", function (e) { if (e.button === 0) { drop.press(true); prefetch(a.href); } });
      a.addEventListener("click", function (e) {
        if (!plainClick(e, a)) { drop.press(false); return; }
        e.preventDefault();
        if (i === active) { drop.press(false); window.scrollTo({ top: 0, behavior: reduce() ? "auto" : "smooth" }); return; }
        if (navigating) return;
        select(i);
        go(a.href);
      });
    });
    var release = function () { drop.press(false); };
    nav.addEventListener("pointerup", release);
    nav.addEventListener("pointercancel", release);
    nav.addEventListener("pointerleave", function () { release(); if (!navigating) hoverOff(); });
    nav.addEventListener("focusout", function () { if (!navigating) hoverOff(); });

    if (window.ResizeObserver) new ResizeObserver(refit).observe(nav);
    window.addEventListener("resize", refit);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refit);

    // Orqaga/oldinga (bfcache) qaytganda holat tiklansin.
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) { navigating = false; hov = -1; active = findActive(items); settle(); }
    });
  }

  /* ---------- Profil / savat kapsulasi: hover tomchi ---------- */
  if (tools) {
    var tl = tools.querySelector(".lg-lens");
    var tdrop = tl ? Drop(tl) : null;
    var drawer = $("cartDrawer");
    var cart = $("cartBtn");

    var toolTo = function (el) {
      if (!el || el.hidden || !el.offsetWidth || !tdrop) return;
      if (!tools.classList.contains("is-hover")) tdrop.snap(el.offsetLeft, el.offsetWidth);
      else tdrop.to(el.offsetLeft, el.offsetWidth);
      tools.classList.add("is-hover");
    };
    var held = function () { return drawer && drawer.classList.contains("open") ? cart : null; };
    var releaseTools = function () {
      var h = held();
      if (h) toolTo(h); else tools.classList.remove("is-hover");
      if (tdrop) tdrop.press(false);
    };

    tools.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var t = e.target.closest ? e.target.closest(".lg-tool") : null;
      if (t && tools.contains(t)) toolTo(t);
    });
    tools.addEventListener("pointerdown", function (e) { if (tdrop && e.pointerType !== "touch") tdrop.press(true); });
    tools.addEventListener("pointerup", function () { if (tdrop) tdrop.press(false); });
    tools.addEventListener("pointerleave", releaseTools);
    tools.addEventListener("focusin", function (e) {
      var t = e.target.closest ? e.target.closest(".lg-tool") : null;
      if (t && e.target.matches && e.target.matches(":focus-visible")) toolTo(t);
    });
    tools.addEventListener("focusout", releaseTools);

    if (drawer && window.MutationObserver) {
      new MutationObserver(function () { window.setTimeout(releaseTools, 0); })
        .observe(drawer, { attributes: true, attributeFilter: ["class"] });
    }
  }

  /* ---------- Sarlavha soyasi ---------- */
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Telefon menyusi ---------- */
  var toggle = $("menuToggle");
  var panel = $("mobileNav");
  var scrim = $("mobileNavOverlay");
  if (!toggle || !panel || !scrim) return;

  var links = [].slice.call(panel.querySelectorAll(".lg-menu-link"));
  var idx = panel.querySelector(".lg-menu-index");
  var current = findActive(links);
  links.forEach(function (a, i) {
    if (i === current) a.setAttribute("aria-current", "page");
  });
  if (idx) idx.innerHTML = "<b>" + String(current < 0 ? 1 : current + 1).padStart(2, "0") + "</b> / " + String(links.length).padStart(2, "0");

  function bodyShouldStayLocked() {
    var d = $("cartDrawer");
    return !!doc.querySelector(".modal-overlay.open") || !!(d && d.classList.contains("open"));
  }

  function setMenu(open) {
    if (open) {
      var r = toggle.getBoundingClientRect();
      panel.style.top = Math.round(r.bottom + 12) + "px";
    }
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Menyuni yopish" : "Menyuni ochish");
    panel.classList.toggle("open", open);
    scrim.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    if (open) doc.body.classList.add("locked");
    else if (!bodyShouldStayLocked()) doc.body.classList.remove("locked");
  }

  var isOpen = function () { return toggle.getAttribute("aria-expanded") === "true"; };

  toggle.addEventListener("click", function () { setMenu(!isOpen()); });
  scrim.addEventListener("click", function () { setMenu(false); });
  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) { setMenu(false); toggle.focus(); }
  });

  links.forEach(function (a, i) {
    a.addEventListener("pointerdown", function () { prefetch(a.href); }, { passive: true });
    a.addEventListener("click", function (e) {
      if (!plainClick(e, a)) return;
      e.preventDefault();
      setMenu(false);
      if (i === current) return;
      if (navigating) return;
      navigating = true;
      var href = a.href;
      location.href = href;
    });
  });

  // Ekran kengayib desktop ko'rinishga o'tsa, menyu yopilsin.
  if (window.matchMedia) {
    var mq = window.matchMedia("(min-width: " + (BP + 1) + "px)");
    var onMq = function () { if (mq.matches && isOpen()) setMenu(false); };
    if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  }
  window.addEventListener("pageshow", function (e) { if (e.persisted) { navigating = false; setMenu(false); } });
})();
