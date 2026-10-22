/* Dark theme boshqaruvi — barcha ommaviy sahifalarda bir xil ishlaydi.

   Muhim: bu skript har sahifaning <head> qismida, CSS'dan OLDIN ulanadi.
   Shu sababli saqlangan tanlov sahifa chizilishidan oldin qo'llanadi va
   dark theme yoqilgan foydalanuvchi sahifa ochilganda oq "chaqnash"ni
   ko'rmaydi.

   Tanlov brauzerda (localStorage) saqlanadi, shuning uchun sahifadan-sahifaga
   o'tganda ham, qayta kirganda ham saqlanib turadi. Boshqa ochiq tabda
   o'zgartirilsa, bu tab ham o'zi yangilanadi.

   Animatsiya: brauzer View Transitions API'ni qo'llab-quvvatlasa, yangi mavzu
   tugma turgan joydan doira shaklida kengayib ochiladi (yoqishda ham,
   o'chirishda ham). Qo'llab-quvvatlamasa — ranglar silliq o'tadi.
   `prefers-reduced-motion` yoqilgan bo'lsa animatsiyasiz almashadi. */
(function () {
  "use strict";

  var KEY = "lg-theme";
  var DURATION = 650; // ms
  var root = document.documentElement;
  var busy = false;

  function stored() {
    try {
      return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
    } catch (_) {
      return "light"; // localStorage yopiq bo'lsa (private rejim) — oddiy mavzu
    }
  }

  function remember(theme) {
    try { localStorage.setItem(KEY, theme); } catch (_) { /* e'tiborsiz */ }
  }

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  /* Brauzer manzil satri rangi (mobil Chrome) mavzuga mos bo'lsin. */
  function syncThemeColor(theme) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      if (!document.head) return;
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "dark" ? "#0a1620" : "#ffffff";
  }

  /* Mavzuni DOM'ga qo'llash (animatsiyasiz). */
  function paint(theme) {
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    syncThemeColor(theme);
    try {
      document.dispatchEvent(new CustomEvent("lg:theme", { detail: { theme: theme } }));
    } catch (_) { /* e'tiborsiz */ }
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function originPoint(origin) {
    if (origin && typeof origin.x === "number" && typeof origin.y === "number") return origin;
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function set(theme, origin) {
    theme = theme === "dark" ? "dark" : "light";
    if (busy || theme === current()) return;
    remember(theme);

    if (reducedMotion()) { paint(theme); return; }

    if (typeof document.startViewTransition === "function") {
      var pt = originPoint(origin);
      var radius = Math.hypot(
        Math.max(pt.x, window.innerWidth - pt.x),
        Math.max(pt.y, window.innerHeight - pt.y)
      );
      busy = true;
      root.classList.add("theme-vt");
      var transition;
      try {
        transition = document.startViewTransition(function () { paint(theme); });
      } catch (_) {
        root.classList.remove("theme-vt");
        busy = false;
        paint(theme);
        return;
      }
      transition.ready.then(function () {
        root.animate(
          {
            clipPath: [
              "circle(0px at " + pt.x + "px " + pt.y + "px)",
              "circle(" + radius + "px at " + pt.x + "px " + pt.y + "px)"
            ]
          },
          {
            duration: DURATION,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)"
          }
        );
      }).catch(function () { /* o'tish bekor bo'lsa, mavzu baribir qo'llangan */ });
      var done = function () {
        root.classList.remove("theme-vt");
        busy = false;
      };
      transition.finished.then(done, done);
      return;
    }

    /* Zaxira: View Transitions yo'q brauzerlarda ranglar silliq o'tadi. */
    busy = true;
    root.classList.add("theme-fade");
    paint(theme);
    window.setTimeout(function () {
      root.classList.remove("theme-fade");
      busy = false;
    }, 520);
  }

  function toggle(origin) {
    set(current() === "dark" ? "light" : "dark", origin);
  }

  /* Boshqa tabda o'zgartirilsa — bu tab ham mos bo'ladi (animatsiyasiz). */
  window.addEventListener("storage", function (e) {
    if (e.key === KEY && stored() !== current()) paint(stored());
  });

  /* Sahifa ochilishi bilan, birinchi chizilishdan oldin. */
  if (stored() === "dark") root.setAttribute("data-theme", "dark");
  if (document.head) syncThemeColor(current());

  window.LGTheme = { get: current, set: set, toggle: toggle };
})();
