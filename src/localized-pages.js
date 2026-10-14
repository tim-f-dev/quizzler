export async function localizedPage(response, env, language, pagePath) {
  if (response.status >= 300 && response.status < 400) {
    const redirected = new Response(response.body, response);
    const location = redirected.headers.get("Location");
    if (location?.startsWith("/") && !/^\/(en|de)(\/|$)/.test(location)) {
      redirected.headers.set("Location", "/" + language + location);
    }
    return redirected;
  }
  if (!response.headers.get("Content-Type")?.includes("text/html")) return response;
  const translation = await env.ASSETS.fetch(new Request("https://assets.local/translations/" + language + ".json"));
  const labels = await translation.json();
  const canonical = new URL("/" + language + pagePath, "https://quizzler.cc").href;
  const page = pagePath.includes("/trivia/trivial-pursuit") ? "trivialPursuit" : pagePath.split("/").filter(Boolean)[0];
  const title = page === "daily" ? '"Quizzler Daily" - Daily trivia game' :
    labels[page] ? labels[page] + " | Quizzler" : null;
  return new HTMLRewriter()
    .on("html", { element(el) { el.setAttribute("lang", language); } })
    .on("[data-i18n]", { element(el) {
      const value = labels[el.getAttribute("data-i18n")];
      if (typeof value === "string") el.setInnerContent(value);
    } })
    .on("[data-i18n-aria-label]", { element(el) {
      const value = labels[el.getAttribute("data-i18n-aria-label")];
      if (typeof value === "string") el.setAttribute("aria-label", value);
    } })
    .on("title", { element(el) { if (title) el.setInnerContent(title); } })
    .on("[data-site-path]", { element(el) { el.setAttribute("href", "/" + language + el.getAttribute("data-site-path")); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute("href", canonical); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute("content", canonical); } })
    .on("head", { element(el) {
      for (const lang of ["en", "de"]) {
        const href = new URL("/" + lang + pagePath, "https://quizzler.cc").href.replace(/&/g, "&amp;");
        el.append('<link rel="alternate" hreflang="' + lang + '" href="' + href + '">', { html: true });
      }
    } }).transform(response);
}
