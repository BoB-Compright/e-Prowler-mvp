// Runs before paint so the saved sidebar collapse state applies immediately
// on load instead of flashing the expanded sidebar first. Kept as a tiny
// standalone inline script (not next/script) because it must execute
// synchronously in <head>, mirroring ThemeScript.
const NAV_INIT_SCRIPT = `
(function () {
  try {
    if (localStorage.getItem("nhg_nav_collapsed") === "1") {
      document.documentElement.dataset.navCollapsed = "1";
    }
  } catch (e) {}
})();
`;

export function NavCollapseScript() {
  return <script dangerouslySetInnerHTML={{ __html: NAV_INIT_SCRIPT }} />;
}
