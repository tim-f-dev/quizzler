(() => {
  const languageCode = window.location.pathname.split('/')[1] === 'de' ? 'de' : 'en';
  const prefix = '/' + languageCode;
  document.querySelectorAll("[data-site-path]").forEach(link => {
    link.href = prefix + link.dataset.sitePath;
  });
  document.documentElement.lang = languageCode;
  const header = document.createElement("header");
  header.className = "site-header";
  const home = document.createElement("a");
  home.href = prefix + "/";
  home.setAttribute("aria-label", "Home");
  home.dataset.i18nAriaLabel = "home";
  const logo = document.createElement("img");
  logo.src = "/files/photos/quizzler_bluecap.png";
  logo.alt = "Quizzler";
  home.append(logo);
  header.append(home);
  const speech = document.createElement("p");
  speech.id = "telephone-speech";
  speech.className = "telephone-speech";
  speech.setAttribute("role", "status");
  speech.hidden = true;
  header.append(speech);
  if (!document.body.hasAttribute("data-home-page")) {
    document.body.prepend(header);
  }

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.setAttribute("aria-label", "Legal and language options");
  footer.dataset.i18nAriaLabel = "footerOptions";
  for (const [path, label] of [
    ["legal-notice", "Legal Notice"],
    ["privacy-policy", "Privacy Policy"],
  ]) {
    const link = document.createElement("a");
    link.href = prefix + "/" + path + "/";
    link.dataset.i18n = path;
    link.textContent = label;
    footer.append(link);
  }
  const language = document.createElement("button");
  language.type = "button";
  language.id = "language-switcher";
  language.textContent = "Deutsch / English";
  language.setAttribute("aria-label", "Switch to German");
  language.dataset.i18nAriaLabel = "switchLanguage";
  footer.append(language);
  document.body.append(footer);
})();
