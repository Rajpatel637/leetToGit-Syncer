document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-setup");
  if (btn) {
    btn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
});
