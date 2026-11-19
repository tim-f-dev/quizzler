import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import de from '../public/translations/de.json';
import en from '../public/translations/en.json';
import { languageFromPath, switchLanguageUrl } from './language-url.js';

@Injectable({ providedIn: 'root' })
export class Site {
  private readonly document = inject(DOCUMENT);
  private readonly location = this.document.location;
  readonly language = languageFromPath(this.location.pathname);
  readonly labels: Record<string, string> = this.language === 'de' ? de : en;
  readonly view = this.document.querySelector('quizzler-app')?.getAttribute('data-view');

  text(key: string): string {
    return this.labels[key] ?? en[key as keyof typeof en] ?? key;
  }

  link(path: string): string {
    return '/' + this.language + path;
  }

  initialize(): void {
    this.document.documentElement.lang = this.language;
    try {
      this.document.defaultView?.localStorage.setItem('quizzler-language', this.language);
    } catch {
      // Browsers can disable storage independently of navigation.
    }
  }

  switchLanguage(): void {
    this.location.assign(switchLanguageUrl(this.location.href));
  }
}

export class LocalizedView {
  protected readonly site = inject(Site);
  readonly text = (key: string) => this.site.text(key);
  readonly link = (path: string) => this.site.link(path);
}
