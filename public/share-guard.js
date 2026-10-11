/*
 * Share-link guard (runs synchronously in <head>, before any deferred script).
 *
 * The hosting platform injects its own visitor analytics, which reports location.href shortly after
 * load. A share link carries the user's figures in the URL (#d=..., legacy ?d=...), so the payload
 * is moved into sessionStorage and removed from the address bar here, before that script can read
 * it. The app picks it up from sessionStorage once (src/lib/publicShare.ts, takeStashedSharePayload).
 * Plain ES5, no dependencies, same-origin file so the CSP (script-src 'self') allows it.
 */
(function () {
  try {
    if (location.pathname !== "/resultat") return; // share links only ever point here
    var hash = location.hash || "";
    var search = location.search || "";
    var m = /(?:^#|&)d=([^&]*)/.exec(hash) || /(?:^\?|&)d=([^&]*)/.exec(search);
    if (!m) return;
    sessionStorage.setItem("frihedsmodel-share-payload", decodeURIComponent(m[1]));
    history.replaceState(history.state, "", location.pathname);
  } catch (e) {
    // sessionStorage blocked: leave the URL alone so the share link still works in the app.
  }
})();
