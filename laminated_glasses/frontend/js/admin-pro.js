/* Admin panel "Pro" qo'shimchalari: tungi rejim, yon panelni yig'ish, yuqori panel sarlavhasi.
   admin.js ga tegmaydi — faqat mavjud tugmalar va sinflarni kuzatadi. */
(function () {
  const THEME_KEY = "lg_admin_theme";
  const SIDE_KEY = "lg_admin_side";
  const body = document.body;

  function applyTheme(t) {
    if (t === "dark") body.setAttribute("data-atheme", "dark");
    else body.removeAttribute("data-atheme");
  }
  try { applyTheme(localStorage.getItem(THEME_KEY) || ""); } catch (_) {}

  const shell = document.getElementById("dashShell");
  try { if (localStorage.getItem(SIDE_KEY) === "1") shell.classList.add("collapsed"); } catch (_) {}

  document.getElementById("proThemeBtn")?.addEventListener("click", () => {
    const next = body.getAttribute("data-atheme") === "dark" ? "" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  });

  document.getElementById("proSideBtn")?.addEventListener("click", () => {
    const on = shell.classList.toggle("collapsed");
    try { localStorage.setItem(SIDE_KEY, on ? "1" : "0"); } catch (_) {}
  });

  /* Sarlavha: faol bo'lim nomi */
  const crumb = document.getElementById("proCrumbTitle");
  const nav = document.getElementById("sideNav");
  function syncTitle() {
    const active = nav.querySelector("button.active");
    if (crumb && active) crumb.textContent = active.dataset.title || active.textContent.trim();
  }
  nav.addEventListener("click", () => setTimeout(syncTitle, 0));
  syncTitle();

  /* Sana */
  const dateEl = document.getElementById("proDate");
  if (dateEl) {
    const months = ["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"];
    const d = new Date();
    dateEl.textContent = `${d.getDate()}-${months[d.getMonth()]}, ${d.getFullYear()}`;
  }

  /* "/" tugmasi — mahsulot qidiruvga o'tish (yozish maydonida bo'lmasa) */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
    const search = document.getElementById("productSearchAdmin");
    if (!search) return;
    e.preventDefault();
    nav.querySelector('[data-view="products"]')?.click();
    setTimeout(() => search.focus(), 30);
  });
})();
