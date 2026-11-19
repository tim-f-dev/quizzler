import { Component } from '@angular/core';
import { LocalizedView } from './site';
import {
  AboutPage, AdminPage, DailyPage, HomePage, LegalNoticePage, OtherPage,
  PrivacyPolicyPage, TriviaPage, TrivialPursuitPage,
} from './pages';

@Component({
  selector: 'quizzler-app',
  imports: [
    AboutPage, AdminPage, DailyPage, HomePage, LegalNoticePage, OtherPage,
    PrivacyPolicyPage, TriviaPage, TrivialPursuitPage,
  ],
  templateUrl: './app.component.html',
  styles: [':host { display: contents; }'],
})
export class AppComponent extends LocalizedView {
  readonly view = this.site.view;
  readonly language = this.site.language;

  constructor() {
    super();
    this.site.initialize();
  }

  switchLanguage(): void {
    this.site.switchLanguage();
  }
}
