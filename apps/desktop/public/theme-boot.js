// Apply the theme before first paint (see src/app/theme.tsx). A plain blocking script in
// <head>, not inline, so a strict CSP (`script-src 'self'`) needs no hash for it.
(function () {
  var m = "system";
  try {
    m = localStorage.getItem("shards-theme") || "system";
  } catch {
    // storage blocked: keep "system"
  }
  var dark = m === "dark" || (m !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
