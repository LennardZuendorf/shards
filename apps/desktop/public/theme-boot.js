// Apply the theme before first paint (see src/app/theme.tsx). A plain blocking script in
// <head>, not inline, so a strict CSP (`script-src 'self'`) needs no hash for it.
(function () {
  var m = "system";
  var stone = "flint";
  try {
    m = localStorage.getItem("shards-theme") || "system";
    stone = localStorage.getItem("shards-stone") || "flint";
  } catch {
    // storage blocked: keep "system"
  }
  var dark = m === "dark" || (m !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
  if (["flint", "jade", "moonstone", "sandstone"].indexOf(stone) === -1) stone = "flint";
  document.documentElement.setAttribute("data-stone", stone);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
