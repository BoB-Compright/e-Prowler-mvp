// Runs before paint so the saved theme applies immediately on load instead of
// flashing light mode first. Kept as a tiny standalone inline script (not
// next/script) because it must execute synchronously in <head>.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
