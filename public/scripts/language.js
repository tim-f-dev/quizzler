(() => {
  const translationsBase = new URL("../translations/", document.currentScript.src);
  const button = document.getElementById("language-switcher");
  const translations = {};
  let language = window.location.pathname.split('/')[1] === 'de' ? 'de' : 'en';
  let busy = false;

  async function applyLanguage(nextLanguage) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    try {
      if (!translations[nextLanguage]) {
        const response = await fetch(new URL(nextLanguage + ".json", translationsBase));
        if (!response.ok) throw new Error("Could not load translations.");
        translations[nextLanguage] = await response.json();
      }
      const labels = translations[nextLanguage];
      document.querySelectorAll("[data-i18n]").forEach((element) => {
        const text = labels[element.dataset.i18n];
        if (typeof text === "string") element.textContent = text;
      });
      document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
        const text = labels[element.dataset.i18nAriaLabel];
        if (typeof text === "string") element.setAttribute("aria-label", text);
      });
      document.documentElement.lang = nextLanguage;
      if (document.body.dataset.page) {
        document.title = document.body.dataset.title || (labels[document.body.dataset.page] + " | Quizzler");
      }
      language = nextLanguage;
      document.dispatchEvent(new CustomEvent("languagechange", {
        detail: { language, labels },
      }));
      button.textContent = language === "en" ? "Deutsch / English ✓" : "Deutsch ✓ / English";
      try {
        localStorage.setItem("quizzler-language", language);
      } catch {
        // The current page does not need persistent storage.
      }
    } catch (error) {
      console.error("Language switching failed:", error);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  if (button) {
    button.addEventListener("click", () => {
      const next = language === "en" ? "de" : "en";
      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(/^\/(en|de)(?=\/|$)/, '/' + next);
      window.location.assign(url.toString());
    });
    applyLanguage(language);
  }
})();
