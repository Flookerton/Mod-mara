/* Applies the saved look before the page paints. A link can also pick it: ?skin=glitch */
(function () {
  var s = null;
  try { s = window.localStorage.getItem("opart-studio-skin"); } catch (e) { /* storage blocked */ }
  var m = /[?&]skin=(glitch|vintage)\b/.exec(window.location.search);
  if (m) s = m[1];
  if (s === "glitch" || s === "vintage") document.documentElement.setAttribute("data-skin", s);
})();
