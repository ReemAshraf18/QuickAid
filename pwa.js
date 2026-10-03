"use strict";
/* PWA glue: safe service-worker registration, offline notice, and a friendly message in place of the Google Maps iframe. */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      try {
        navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(function (e) {
          console.warn("Service worker registration failed:", e);
        });
      } catch (e) { console.warn("Service worker unavailable:", e); }
    });
  }

  var bar = document.createElement("div");
  bar.className = "alert alert-warning mb-0 rounded-0 text-center py-1 small d-none";
  bar.setAttribute("role", "status");
  bar.textContent = "You're offline. Saved hospital, pharmacy, clinic and first-aid information is still available; maps and external links need internet.";
  document.body.prepend(bar);

  function fixMaps() {
    if (navigator.onLine) return;
    document.querySelectorAll('#app iframe[src*="google.com/maps"]').forEach(function (f) {
      var d = document.createElement("div");
      d.className = "w-100 rounded border bg-light p-4 text-center text-muted";
      d.style.minHeight = "260px";
      d.textContent = "The map needs an internet connection. The address and phone details shown on this page are still available.";
      f.replaceWith(d);
    });
  }
  function update() {
    bar.classList.toggle("d-none", navigator.onLine);
    fixMaps();
  }
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  var app = document.getElementById("app");
  if (app && "MutationObserver" in window) new MutationObserver(fixMaps).observe(app, { childList: true, subtree: true });
  update();
})();
