/* Laminated Glasses — navigatsiya boshqaruvi.
   1) Desktop: suyuq shisha linza faol bo'limga ko'chib o'tadi, keyin sahifa ochiladi.
   2) Profil/savat kapsulasi: linza sichqoncha ostidagi tugmaga siljiydi
      (savat ochiq bo'lsa savatda "ushlanib" turadi).
   3) Telefon: burger tugma va yuqoridan ochiladigan shisha menyu.
   main.js'dan mustaqil ishlaydi. */
(function () {
  "use strict";

  var BP = 960;
  var NAV_DELAY = 480;
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
    var run = function () { location.href = href; };
    if (reduce()) run(); else window.setTimeout(run, NAV_DELAY);
  }

  function plainClick(e, a) {
    return !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === "_blank");
  }

  /* ---------- Desktop kapsula ---------- */
  if (nav) {
    var items = [].slice.call(nav.querySelectorAll(".lg-nav-item"));
    var lens = nav.querySelector(".lg-lens");
    var label = $("lgLensLabel");
    var active = findActive(items);
    var moveTimer;

    var place = function (el) {
      if (!el || !el.offsetWidth) return;
      lens.style.setProperty("--lx", el.offsetLeft + "px");
      lens.style.setProperty("--lw", el.offsetWidth + "px");
    };

    var mark = function (i) {
      items.forEach(function (a, k) {
        if (k === i) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      });
      if (label && items[i]) label.textContent = items[i].textContent.trim();
    };

    var select = function (i) {
      active = i;
      mark(i);
      place(items[i]);
      nav.classList.remove("is-moving");
      void nav.offsetWidth;
      nav.classList.add("is-moving");
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(function () { nav.classList.remove("is-moving"); }, 680);
    };

    var settle = function () {
      if (active < 0) { nav.classList.remove("is-ready"); return; }
      mark(active);
      place(items[active]);
      nav.classList.add("is-ready");
    };

    settle();
    // Birinchi joylashuv animatsiyasiz; keyingilari silliq.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { nav.classList.add("is-anim"); });
    });

    items.forEach(function (a, i) {
      a.addEventListener("click", function (e) {
        if (!plainClick(e, a)) return;
        e.preventDefault();
        if (i === active) { window.scrollTo({ top: 0, behavior: reduce() ? "auto" : "smooth" }); return; }
        if (navigating) return;
        select(i);
        go(a.href);
      });
    });

    if (window.ResizeObserver) new ResizeObserver(function () { if (active >= 0) place(items[active]); }).observe(nav);
    window.addEventListener("resize", function () { if (active >= 0) place(items[active]); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { if (active >= 0) place(items[active]); });

    // Orqaga/oldinga (bfcache) qaytganda holat tiklansin.
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) { navigating = false; active = findActive(items); settle(); }
    });
  }

  /* ---------- Profil / savat kapsulasi: hover linza ---------- */
  if (tools) {
    var tl = tools.querySelector(".lg-lens");
    var drawer = $("cartDrawer");
    var cart = $("cartBtn");

    var toolTo = function (el) {
      if (!el || el.hidden || !el.offsetWidth || !tl) return;
      var set = function () {
        tl.style.setProperty("--lx", el.offsetLeft + "px");
        tl.style.setProperty("--lw", el.offsetWidth + "px");
      };
      if (!tools.classList.contains("is-hover")) {
        tl.style.transition = "none";
        set();
        void tl.offsetWidth;
        tl.style.transition = "";
      }
      set();
      tools.classList.add("is-hover");
    };
    var held = function () { return drawer && drawer.classList.contains("open") ? cart : null; };
    var release = function () {
      var h = held();
      if (h) toolTo(h); else tools.classList.remove("is-hover");
    };

    tools.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var t = e.target.closest ? e.target.closest(".lg-tool") : null;
      if (t && tools.contains(t)) toolTo(t);
    });
    tools.addEventListener("pointerleave", release);
    tools.addEventListener("focusin", function (e) {
      var t = e.target.closest ? e.target.closest(".lg-tool") : null;
      if (t && e.target.matches && e.target.matches(":focus-visible")) toolTo(t);
    });
    tools.addEventListener("focusout", release);

    if (drawer && window.MutationObserver) {
      new MutationObserver(function () { window.setTimeout(release, 0); })
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
    a.addEventListener("click", function (e) {
      if (!plainClick(e, a)) return;
      e.preventDefault();
      setMenu(false);
      if (i === current) return;
      if (navigating) return;
      navigating = true;
      var href = a.href;
      var run = function () { location.href = href; };
      if (reduce()) run(); else window.setTimeout(run, 320);
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
