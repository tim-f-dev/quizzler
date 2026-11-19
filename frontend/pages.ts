import { afterNextRender, Component } from '@angular/core';
import { LocalizedView } from './site';

@Component({
  selector: 'quizzler-home',
  templateUrl: './pages/home.html',
  styles: [':host { display: contents; }'],
})
export class HomePage extends LocalizedView {}

@Component({
  selector: 'quizzler-about',
  templateUrl: './pages/about.html',
  styles: [':host { display: contents; }'],
})
export class AboutPage extends LocalizedView {}

@Component({
  selector: 'quizzler-admin',
  templateUrl: './pages/admin.html',
  styles: [':host { display: contents; }'],
})
export class AdminPage extends LocalizedView {
  constructor() {
    super();
    afterNextRender(async () => {
      const { mount } = await import('./controllers/admin.js');
      mount();
    });
  }
}

@Component({
  selector: 'quizzler-daily',
  templateUrl: './pages/daily.html',
  styles: [':host { display: contents; }'],
})
export class DailyPage extends LocalizedView {
  constructor() {
    super();
    afterNextRender(async () => {
      await Promise.all([
        import('./controllers/telephone-joker.js'),
        import('./controllers/chat-joker.js'),
      ]);
      const { mount } = await import('./controllers/daily.js');
      mount(this.site.labels);
    });
  }
}

@Component({
  selector: 'quizzler-legal-notice',
  templateUrl: './pages/legal-notice.html',
  styles: [':host { display: contents; }'],
})
export class LegalNoticePage extends LocalizedView {}

@Component({
  selector: 'quizzler-other',
  templateUrl: './pages/other.html',
  styles: [':host { display: contents; }'],
})
export class OtherPage extends LocalizedView {
  constructor() {
    super();
    afterNextRender(async () => {
      const { mount } = await import('./controllers/other.js');
      mount(this.site.labels);
    });
  }
}

@Component({
  selector: 'quizzler-privacy-policy',
  templateUrl: './pages/privacy-policy.html',
  styles: [':host { display: contents; }'],
})
export class PrivacyPolicyPage extends LocalizedView {}

@Component({
  selector: 'quizzler-trivia',
  templateUrl: './pages/trivia.html',
  styles: [':host { display: contents; }'],
})
export class TriviaPage extends LocalizedView {}

@Component({
  selector: 'quizzler-trivial-pursuit',
  templateUrl: './pages/trivial-pursuit.html',
  styles: [':host { display: contents; }'],
})
export class TrivialPursuitPage extends LocalizedView {
  constructor() {
    super();
    afterNextRender(async () => {
      const { mount } = await import('./controllers/trivial-pursuit.js');
      mount(this.site.labels);
    });
  }
}
