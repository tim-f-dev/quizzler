export function languageFromPath(pathname) {
  return pathname.split('/')[1] === 'de' ? 'de' : 'en';
}

export function switchLanguageUrl(href) {
  const url = new URL(href);
  const next = languageFromPath(url.pathname) === 'de' ? 'en' : 'de';
  url.pathname = url.pathname.replace(/^\/(en|de)(?=\/|$)/, '/' + next);
  return url.toString();
}
