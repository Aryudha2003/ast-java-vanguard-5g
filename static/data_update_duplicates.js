document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("duplicateToggle");
  const panel = document.getElementById("duplicatePanel");

  if (!btn || !panel) {
    console.log("Duplicate toggle elements not found");
    return;
  }

  btn.addEventListener("click", () => {
    const isHidden = panel.hasAttribute("hidden");

    if (isHidden) {
      panel.removeAttribute("hidden");
      btn.textContent = "Hide Duplicates";
      btn.setAttribute("aria-expanded", "true");
    } else {
      panel.setAttribute("hidden", "");
      btn.textContent = "View Duplicates";
      btn.setAttribute("aria-expanded", "false");
    }
  });
});