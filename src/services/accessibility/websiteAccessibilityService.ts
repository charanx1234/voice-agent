import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import {
  AccessibilityCommandResult,
  WebsiteAccessibilityState,
  WebsiteElement,
  WebsitePageStructure,
} from '../../shared/types';

export class WebsiteAccessibilityService extends EventEmitter {
  private browserWindow: BrowserWindow | null = null;
  private state: WebsiteAccessibilityState = {
    enabled: false,
    connected: false,
    browserName: 'Accessible Browser',
    currentUrl: 'about:blank',
    currentTitle: 'No page loaded',
    readingStatus: 'idle',
    readingSpeed: 1.0,
    currentElement: null,
    currentIndex: -1,
    totalElements: 0,
    lastCommand: '',
    statusMessage: 'Website Accessibility is ready.',
    language: 'en',
  };

  private currentStructure: WebsitePageStructure | null = null;
  private navigationElements: WebsiteElement[] = [];
  private pendingDisambiguation: {
    command: string;
    options: WebsiteElement[];
  } | null = null;
  private lastReadText: string = '';
  private readingQueue: string[] = [];
  private readingIndex: number = 0;
  private confirmationRequester: ((message: string) => Promise<boolean>) | null = null;

  constructor() {
    super();
  }

  public setConfirmationRequester(fn: (message: string) => Promise<boolean>) {
    this.confirmationRequester = fn;
  }

  public getState(): WebsiteAccessibilityState {
    return { ...this.state };
  }

  public async setEnabled(enabled: boolean): Promise<WebsiteAccessibilityState> {
    this.state.enabled = enabled;
    if (enabled) {
      this.state.statusMessage = 'Website Accessibility Mode enabled. Voice commands active.';
      await this.ensureBrowserWindow();
    } else {
      this.state.statusMessage = 'Website Accessibility Mode disabled.';
      this.stopReading();
    }
    this.emitState();
    return this.getState();
  }

  public setReadingSpeed(speed: number): number {
    const clamped = Math.max(0.5, Math.min(2.5, Math.round(speed * 100) / 100));
    this.state.readingSpeed = clamped;
    this.state.statusMessage = `Reading speed set to ${clamped}x`;
    this.emitState();
    return clamped;
  }

  public stopReading(): boolean {
    this.state.readingStatus = 'idle';
    this.readingQueue = [];
    this.readingIndex = 0;
    this.emitState();
    return true;
  }

  public pauseReading(): boolean {
    if (this.state.readingStatus === 'reading') {
      this.state.readingStatus = 'paused';
      this.state.statusMessage = 'Reading paused.';
      this.emitState();
      return true;
    }
    return false;
  }

  public resumeReading(): boolean {
    if (this.state.readingStatus === 'paused') {
      this.state.readingStatus = 'reading';
      this.state.statusMessage = 'Reading resumed.';
      this.emitState();
      return true;
    }
    return false;
  }

  /**
   * Initializes or brings up the dedicated Accessible BrowserWindow
   */
  public async ensureBrowserWindow(): Promise<BrowserWindow> {
    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      this.browserWindow.show();
      this.browserWindow.focus();
      return this.browserWindow;
    }

    this.browserWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      title: 'FRIDAY Accessible Browser',
      backgroundColor: '#0a0a0a',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    this.browserWindow.on('closed', () => {
      this.browserWindow = null;
      this.state.connected = false;
      this.state.currentTitle = 'No page loaded';
      this.state.currentUrl = 'about:blank';
      this.emitState();
    });

    const wc = this.browserWindow.webContents;

    wc.on('did-finish-load', async () => {
      this.state.connected = true;
      this.state.currentTitle = wc.getTitle() || 'Untitled Page';
      this.state.currentUrl = wc.getURL() || 'about:blank';
      await this.injectAccessibilityHelpers();
      await this.extractPageStructure();
      this.state.statusMessage = `Connected: ${this.state.currentTitle}`;
      this.emitState();
    });

    wc.on('did-navigate', async (_event, url) => {
      this.state.currentUrl = url;
      this.emitState();
    });

    this.state.connected = true;
    this.emitState();
    return this.browserWindow;
  }

  /**
   * Opens any target URL in the accessible browser
   */
  public async openUrl(rawUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      let target = rawUrl.trim();
      if (!/^https?:\/\//i.test(target) && !/^about:/i.test(target)) {
        target = 'https://' + target;
      }

      await this.ensureBrowserWindow();
      if (!this.browserWindow) return { success: false, error: 'Could not initialize browser.' };

      await this.browserWindow.loadURL(target);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to open URL' };
    }
  }

  /**
   * Injects DOM inspection, highlight ring, and element focus helpers into the active tab
   */
  private async injectAccessibilityHelpers(): Promise<void> {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return;

    const script = `
      (function() {
        if (window.__fridayA11yInjected) return;
        window.__fridayA11yInjected = true;

        const style = document.createElement('style');
        style.id = '__friday_a11y_style';
        style.textContent = \`
          .__friday_highlight {
            outline: 3px solid #ffcc00 !important;
            outline-offset: 3px !important;
            box-shadow: 0 0 12px rgba(255, 204, 0, 0.8) !important;
            transition: outline 0.15s ease, box-shadow 0.15s ease !important;
          }
          .__friday_focus_badge {
            position: absolute;
            background: #000000;
            color: #ffffff;
            font-size: 11px;
            font-family: sans-serif;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid #ffcc00;
            z-index: 2147483647;
            pointer-events: none;
          }
        \`;
        document.head.appendChild(style);

        window.__fridayHighlight = function(selector, badgeText) {
          document.querySelectorAll('.__friday_highlight').forEach(el => el.classList.remove('__friday_highlight'));
          const oldBadge = document.getElementById('__friday_badge');
          if (oldBadge) oldBadge.remove();

          const target = document.querySelector(selector);
          if (!target) return false;

          target.classList.add('__friday_highlight');
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          if (typeof target.focus === 'function') target.focus();

          const rect = target.getBoundingClientRect();
          const badge = document.createElement('div');
          badge.id = '__friday_badge';
          badge.className = '__friday_focus_badge';
          badge.textContent = badgeText || 'Focus';
          badge.style.top = Math.max(0, rect.top + window.scrollY - 22) + 'px';
          badge.style.left = Math.max(0, rect.left + window.scrollX) + 'px';
          document.body.appendChild(badge);

          return true;
        };

        window.__fridayClick = function(selector) {
          const el = document.querySelector(selector);
          if (!el) return false;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.click();
          return true;
        };

        window.__fridaySetValue = function(selector, value) {
          const el = document.querySelector(selector);
          if (!el) return false;
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };

        window.__fridayScroll = function(direction, amount) {
          const dy = direction === 'down' ? (amount || window.innerHeight * 0.75) : -(amount || window.innerHeight * 0.75);
          window.scrollBy({ top: dy, behavior: 'smooth' });
          return true;
        };
      })();
    `;

    try {
      await this.browserWindow.webContents.executeJavaScript(script);
    } catch (err) {
      console.warn('[WebsiteAccessibility] Failed to inject helpers:', err);
    }
  }

  /**
   * Inspects the DOM and builds the structured accessibility overview
   */
  public async extractPageStructure(): Promise<WebsitePageStructure> {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return {
        url: this.state.currentUrl,
        title: this.state.currentTitle,
        headings: [],
        paragraphs: [],
        buttons: [],
        links: [],
        formFields: [],
        interactiveCount: 0,
      };
    }

    const extractionScript = `
      (function() {
        const clean = (str) => (str || '').replace(/\\s+/g, ' ').trim();

        // 1. Headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
          .filter(el => el.offsetParent !== null && clean(el.innerText).length > 0)
          .map((el, i) => {
            el.setAttribute('data-friday-id', 'h_' + i);
            const level = parseInt(el.tagName.replace('H', ''), 10) || parseInt(el.getAttribute('aria-level') || '2', 10);
            return {
              id: 'h_' + i,
              type: 'heading',
              tagName: el.tagName.toLowerCase(),
              text: clean(el.innerText),
              level: isNaN(level) ? 2 : level,
              selector: '[data-friday-id="h_' + i + '"]',
              index: i
            };
          });

        // 2. Paragraphs
        const paragraphs = Array.from(document.querySelectorAll('p, [role="paragraph"], article > div, .content > div'))
          .filter(el => el.offsetParent !== null && clean(el.innerText).length > 20)
          .map((el, i) => {
            el.setAttribute('data-friday-id', 'p_' + i);
            return {
              id: 'p_' + i,
              type: 'paragraph',
              tagName: el.tagName.toLowerCase(),
              text: clean(el.innerText),
              selector: '[data-friday-id="p_' + i + '"]',
              index: i
            };
          });

        // 3. Buttons
        const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
          .filter(el => el.offsetParent !== null && (clean(el.innerText || el.value || el.getAttribute('aria-label')).length > 0))
          .map((el, i) => {
            el.setAttribute('data-friday-id', 'btn_' + i);
            const label = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title || 'Button');
            return {
              id: 'btn_' + i,
              type: 'button',
              tagName: el.tagName.toLowerCase(),
              text: label,
              label: label,
              isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
              selector: '[data-friday-id="btn_' + i + '"]',
              index: i
            };
          });

        // 4. Links
        const links = Array.from(document.querySelectorAll('a[href], [role="link"]'))
          .filter(el => el.offsetParent !== null && clean(el.innerText || el.getAttribute('aria-label')).length > 0)
          .slice(0, 100) // limit for performance
          .map((el, i) => {
            el.setAttribute('data-friday-id', 'link_' + i);
            const label = clean(el.innerText || el.getAttribute('aria-label') || el.title);
            return {
              id: 'link_' + i,
              type: 'link',
              tagName: 'a',
              text: label,
              label: label,
              href: el.getAttribute('href') || '',
              selector: '[data-friday-id="link_' + i + '"]',
              index: i
            };
          });

        // 5. Form Fields
        const formFields = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, select, [role="textbox"], [role="combobox"]'))
          .filter(el => el.offsetParent !== null)
          .map((el, i) => {
            el.setAttribute('data-friday-id', 'field_' + i);
            const inputType = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
            const isSensitive = inputType === 'password' || /card|cvv|secret|token/i.test(el.name || el.id || '');
            
            // Associated label lookup
            let label = el.getAttribute('aria-label') || el.placeholder || el.title || '';
            if (!label && el.id) {
              const labelEl = document.querySelector('label[for="' + el.id + '"]');
              if (labelEl) label = clean(labelEl.innerText);
            }
            if (!label) {
              const parentLabel = el.closest('label');
              if (parentLabel) label = clean(parentLabel.innerText);
            }
            if (!label) label = clean(el.name || el.id || 'Input field');

            return {
              id: 'field_' + i,
              type: 'form_field',
              tagName: el.tagName.toLowerCase(),
              text: label,
              label: label,
              inputType: inputType,
              inputValue: isSensitive ? '••••••' : el.value || '',
              placeholder: el.placeholder || '',
              isRequired: el.required || el.getAttribute('aria-required') === 'true',
              isDisabled: el.disabled,
              isSensitive: isSensitive,
              validationMessage: el.validationMessage || '',
              selector: '[data-friday-id="field_' + i + '"]',
              index: i
            };
          });

        return {
          url: window.location.href,
          title: document.title || window.location.hostname,
          headings,
          paragraphs: paragraphs.slice(0, 50),
          buttons,
          links,
          formFields,
          interactiveCount: buttons.length + links.length + formFields.length
        };
      })();
    `;

    try {
      const data: WebsitePageStructure = await this.browserWindow.webContents.executeJavaScript(extractionScript);
      this.currentStructure = data;
      this.navigationElements = [
        ...data.headings,
        ...data.paragraphs,
        ...data.buttons,
        ...data.formFields,
      ];
      this.state.totalElements = this.navigationElements.length;
      this.state.currentTitle = data.title;
      this.state.currentUrl = data.url;
      this.emitState();
      return data;
    } catch (err) {
      console.error('[WebsiteAccessibility] Page extraction error:', err);
      return {
        url: this.state.currentUrl,
        title: this.state.currentTitle,
        headings: [],
        paragraphs: [],
        buttons: [],
        links: [],
        formFields: [],
        interactiveCount: 0,
      };
    }
  }

  /**
   * Natural voice command processor supporting English, Telugu, and Hinglish
   */
  public async executeNaturalCommand(
    rawText: string,
    languageHint?: string
  ): Promise<AccessibilityCommandResult> {
    const text = rawText.toLowerCase().trim();
    this.state.lastCommand = rawText;

    // Detect language intent or preference
    const isTelugu = languageHint === 'te-IN' || /[\u0C00-\u0C7F]/.test(text) || /\b(chaduvu|cheppu|vellu|aapu|choodu|pettuko)\b/i.test(text);
    const isHinglish = /\b(padho|batao|jao|karo|ruko|dhundo|dheere|tez|agla|pichla)\b/i.test(text);

    // If there is an outstanding disambiguation query (e.g. user previously asked "click login" and we asked "1 or 2?")
    if (this.pendingDisambiguation) {
      const pending = this.pendingDisambiguation;
      this.pendingDisambiguation = null;

      let chosenIndex = -1;
      if (/\b(first|one|1|modati|pehla)\b/.test(text)) chosenIndex = 0;
      else if (/\b(second|two|2|rendava|doosra)\b/.test(text)) chosenIndex = 1;
      else if (/\b(third|three|3|moodava|teesra)\b/.test(text)) chosenIndex = 2;

      if (chosenIndex >= 0 && chosenIndex < pending.options.length) {
        const target = pending.options[chosenIndex];
        return await this.clickElement(target);
      }
    }

    // 1. Reading Controls
    if (/(?:\b(stop reading|aapu|chadavadum aapu|padhna band karo|ruko|stop)\b|ఆపు|చదవడం ఆపు)/i.test(text)) {
      this.stopReading();
      return {
        success: true,
        action: 'stop_reading',
        speechText: isTelugu ? 'చదవడం ఆపాను.' : isHinglish ? 'Padhna band kar diya.' : 'Stopped reading.',
      };
    }

    if (/(?:\b(pause reading|pause|aagandi|thehero)\b|నిలిపివేయి|ఆగు)/i.test(text)) {
      this.pauseReading();
      return {
        success: true,
        action: 'pause_reading',
        speechText: isTelugu ? 'చదవడం నిలిపివేశాను.' : isHinglish ? 'Reading pause kar di.' : 'Reading paused.',
      };
    }

    if (/(?:\b(resume reading|resume|malli chaduvu|phir se padho|continue)\b|కొనసాగించు)/i.test(text)) {
      this.resumeReading();
      return {
        success: true,
        action: 'resume_reading',
        speechText: isTelugu ? 'చదవడం కొనసాగిస్తున్నాను.' : isHinglish ? 'Reading resume kar raha hoon.' : 'Resuming reading.',
      };
    }

    if (/(?:\b(repeat that|repeat|malli cheppu|phir se bolo|once more)\b|మళ్ళీ చెప్పు)/i.test(text)) {
      return {
        success: true,
        action: 'repeat',
        speechText: this.lastReadText || (isTelugu ? 'పునరావృతం చేయడానికి ఏమీ లేదు.' : 'Nothing to repeat.'),
      };
    }

    // 2. Reading Speed
    if (/(?:\b(read slower|more slowly|slower|nemmadiga|dheere padho)\b|నెమ్మదిగా|తగ్గించు)/i.test(text)) {
      const newSpeed = this.setReadingSpeed(this.state.readingSpeed - 0.25);
      return {
        success: true,
        action: 'set_speed',
        speechText: isTelugu
          ? `చదివే వేగాన్ని ${newSpeed}x కి తగ్గించాను.`
          : isHinglish
            ? `Speed kam kar ke ${newSpeed}x kar di.`
            : `Reading speed decreased to ${newSpeed}x.`,
      };
    }

    if (/(?:\b(read faster|faster|veganga|tez padho)\b|వేగంగా|పెంచు)/i.test(text)) {
      const newSpeed = this.setReadingSpeed(this.state.readingSpeed + 0.25);
      return {
        success: true,
        action: 'set_speed',
        speechText: isTelugu
          ? `చదివే వేగాన్ని ${newSpeed}x కి పెంచాను.`
          : isHinglish
            ? `Speed badha kar ${newSpeed}x kar di.`
            : `Reading speed increased to ${newSpeed}x.`,
      };
    }

    // 3. Summarize / Read Page
    if (/(?:\b(summarize|summary|saramsam|abstract|kya hai is page pe)\b|సారాంశం|సమ్మరీ)/i.test(text)) {
      return await this.summarizePage(isTelugu, isHinglish);
    }

    if (/(?:\b(read (this )?page|read website|page chaduvu|ye page padho)\b|పేజీని చదువు|చదువు)/i.test(text)) {
      return await this.readFullPage(isTelugu, isHinglish);
    }

    // 4. Heading Navigation
    if (/(?:\b(next heading|tarvaati heading|agla heading)\b|తర్వాతి హెడ్డింగ్|తరువాతి హెడ్డింగ్|హెడ్డింగ్‌కి వెళ్ళు)/i.test(text)) {
      return await this.navigateHeading(1, isTelugu, isHinglish);
    }
    if (/(?:\b(previous heading|prev heading|munupati heading|pichla heading)\b|మునుపటి హెడ్డింగ్)/i.test(text)) {
      return await this.navigateHeading(-1, isTelugu, isHinglish);
    }

    // 5. Paragraph Navigation
    if (/(?:\b(next paragraph|read next paragraph|tarvaati pera|agla paragraph)\b|తర్వాతి పేరా|తరువాతి పేరా)/i.test(text)) {
      return await this.navigateParagraph(1, isTelugu, isHinglish);
    }
    if (/(?:\b(previous paragraph|prev paragraph|munupati pera|pichla paragraph)\b|మునుపటి పేరా)/i.test(text)) {
      return await this.navigateParagraph(-1, isTelugu, isHinglish);
    }

    // 6. Scrolling
    if (/(?:\b(scroll down|krindiki scroll|neeche scroll|scroll kardo)\b|క్రిందికి స్క్రోల్|కిందికి స్క్రోల్)/i.test(text)) {
      return await this.scrollPage('down', isTelugu, isHinglish);
    }
    if (/(?:\b(scroll up|paiki scroll|upar scroll)\b|పైకి స్క్రోల్)/i.test(text)) {
      return await this.scrollPage('up', isTelugu, isHinglish);
    }

    // 7. Navigation History
    if (/(?:\b(go back|back|venukaku vellu|peeche jao)\b|వెనుకకు వెళ్ళు|వెనక్కి వెళ్ళు)/i.test(text)) {
      if (this.browserWindow?.webContents.canGoBack()) {
        this.browserWindow.webContents.goBack();
        return {
          success: true,
          action: 'go_back',
          speechText: isTelugu ? 'వెనుక పేజీకి వెళ్ళాను.' : isHinglish ? 'Peeche chala gaya.' : 'Navigated back.',
        };
      }
      return { success: false, action: 'go_back', speechText: 'Cannot go back further.' };
    }

    // 8. Find Search Box & In-site Search
    const searchMatch = text.match(/\b(?:search for|vetuku|dhundo|search)\s+(.+)/i);
    if (searchMatch && searchMatch[1]) {
      const query = searchMatch[1].replace(/\b(in this page|website|online)\b/gi, '').trim();
      return await this.performSiteSearch(query, isTelugu, isHinglish);
    }

    if (/\b(find (the )?search box|search box|shodhana pette|search kahan hai)\b/.test(text)) {
      return await this.findSearchBox(isTelugu, isHinglish);
    }

    // 9. Form Filling
    const fillMatch = text.match(/\b(?:fill (?:in )?|type |enter |raayi |likho )(?:my |the )?(\w+)\s+(?:with |as |is )?(.+)/i);
    if (fillMatch) {
      const fieldName = fillMatch[1];
      const fieldValue = fillMatch[2];
      return await this.fillFormField(fieldName, fieldValue, isTelugu, isHinglish);
    }

    // 10. Clicking / Selecting Elements
    const clickMatch = text.match(/\b(?:click|tap|open|press|nokku|click karo|dabao)\s+(?:the\s+)?(.+)/i);
    if (clickMatch) {
      const targetQuery = clickMatch[1].replace(/\b(button|link|item)\b/gi, '').trim();
      return await this.findAndClick(targetQuery, isTelugu, isHinglish);
    }

    // 11. Explain Element
    if (/\b(explain (what )?this button does|explain this element|vivarinchu|ye kya karta hai)\b/.test(text)) {
      return this.explainActiveElement(isTelugu, isHinglish);
    }

    // Fallback: search or general guidance
    return {
      success: true,
      action: 'help',
      speechText: isTelugu
        ? 'నేను వెబ్‌సైట్‌ను చదవగలను, హెడ్డింగ్స్ నావిగేట్ చేయగలను, బటన్లను క్లిక్ చేయగలను మరియు ఫారమ్‌లను పూరించగలను.'
        : isHinglish
          ? 'Main website padh sakta hoon, headings navigate kar sakta hoon, buttons click kar sakta hoon aur forms bhar sakta hoon.'
          : 'I can read this website, navigate headings, click buttons, and assist with forms. What would you like to do?',
    };
  }

  // --- Accessibility Navigation Implementations ---

  private async navigateHeading(
    direction: number,
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const headings = this.currentStructure?.headings || [];

    if (headings.length === 0) {
      const msg = isTelugu ? 'ఈ పేజీలో హెడ్డింగ్‌లు కనుగొనబడలేదు.' : 'No headings found on this page.';
      return { success: false, action: 'navigate_heading', speechText: msg };
    }

    let currentIndex = headings.findIndex((h) => h.id === this.state.currentElement?.id);
    if (currentIndex === -1) currentIndex = direction > 0 ? -1 : headings.length;

    let targetIndex = currentIndex + direction;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= headings.length) targetIndex = headings.length - 1;

    const target = headings[targetIndex];
    await this.highlightElement(target.selector, `H${target.level}: ${target.text.slice(0, 20)}`);

    this.state.currentElement = target;
    this.state.currentIndex = targetIndex;
    this.state.statusMessage = `Heading ${targetIndex + 1} of ${headings.length}: ${target.text}`;
    this.emitState();

    const speech = isTelugu
      ? `హెడ్డింగ్ లెవల్ ${target.level}: ${target.text}`
      : isHinglish
        ? `Heading level ${target.level}: ${target.text}`
        : `Heading level ${target.level}: ${target.text}`;

    this.lastReadText = speech;
    return {
      success: true,
      action: 'navigate_heading',
      element: target,
      speechText: speech,
    };
  }

  private async navigateParagraph(
    direction: number,
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const paras = this.currentStructure?.paragraphs || [];

    if (paras.length === 0) {
      const msg = isTelugu ? 'పేజీలో పేరాలు కనుగొనబడలేదు.' : 'No readable paragraphs found on this page.';
      return { success: false, action: 'navigate_paragraph', speechText: msg };
    }

    let currentIndex = paras.findIndex((p) => p.id === this.state.currentElement?.id);
    if (currentIndex === -1) currentIndex = direction > 0 ? -1 : paras.length;

    let targetIndex = currentIndex + direction;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= paras.length) targetIndex = paras.length - 1;

    const target = paras[targetIndex];
    await this.highlightElement(target.selector, `Paragraph ${targetIndex + 1}`);

    this.state.currentElement = target;
    this.state.currentIndex = targetIndex;
    this.state.statusMessage = `Paragraph ${targetIndex + 1} of ${paras.length}`;
    this.emitState();

    const speech = isTelugu
      ? `పేరా ${targetIndex + 1}: ${target.text}`
      : isHinglish
        ? `Paragraph ${targetIndex + 1}: ${target.text}`
        : target.text;

    this.lastReadText = speech;
    return {
      success: true,
      action: 'navigate_paragraph',
      element: target,
      speechText: speech,
    };
  }

  private async scrollPage(
    direction: 'down' | 'up',
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) {
      return { success: false, action: 'scroll', speechText: 'Browser is not open.' };
    }

    try {
      await this.browserWindow.webContents.executeJavaScript(
        `window.__fridayScroll && window.__fridayScroll("${direction}")`
      );
      const msg = direction === 'down'
        ? (isTelugu ? 'క్రిందికి స్క్రోల్ చేశాను.' : isHinglish ? 'Neeche scroll kar diya.' : 'Scrolled down.')
        : (isTelugu ? 'పైకి స్క్రోల్ చేశాను.' : isHinglish ? 'Upar scroll kar diya.' : 'Scrolled up.');

      return { success: true, action: 'scroll', speechText: msg };
    } catch {
      return { success: false, action: 'scroll', speechText: 'Scroll failed.' };
    }
  }

  private async summarizePage(
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const st = this.currentStructure;
    if (!st) return { success: false, action: 'summarize', speechText: 'No page content available.' };

    const topHeadings = st.headings.slice(0, 4).map((h) => h.text).join(', ');
    const speech = isTelugu
      ? `పేజీ శీర్షిక "${st.title}". ఇందులో ${st.headings.length} హెడ్డింగ్‌లు, ${st.buttons.length} బటన్లు మరియు ${st.links.length} లింక్‌లు ఉన్నాయి. ముఖ్య విభాగాలు: ${topHeadings}.`
      : isHinglish
        ? `Page title hai "${st.title}". Isme ${st.headings.length} headings, ${st.buttons.length} buttons aur ${st.links.length} links hain. Main topics: ${topHeadings}.`
        : `Page title is "${st.title}". It has ${st.headings.length} headings, ${st.buttons.length} buttons, and ${st.links.length} links. Key sections include: ${topHeadings}.`;

    this.lastReadText = speech;
    return {
      success: true,
      action: 'summarize',
      summary: speech,
      speechText: speech,
    };
  }

  private async readFullPage(
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const st = this.currentStructure;
    if (!st) return { success: false, action: 'read_page', speechText: 'No content to read.' };

    this.state.readingStatus = 'reading';
    const chunks = [
      st.title,
      ...st.headings.map((h) => `Heading: ${h.text}`),
      ...st.paragraphs.slice(0, 10).map((p) => p.text),
    ];

    this.readingQueue = chunks;
    this.readingIndex = 0;
    this.emitState();

    const firstChunk = chunks.slice(0, 3).join('. ');
    const speech = isTelugu
      ? `పేజీ చదువుతున్నాను. ${firstChunk}`
      : isHinglish
        ? `Page padhna shuru kar raha hoon. ${firstChunk}`
        : `Reading page: ${firstChunk}`;

    this.lastReadText = speech;
    return {
      success: true,
      action: 'read_page',
      speechText: speech,
    };
  }

  private async findSearchBox(
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const fields = this.currentStructure?.formFields || [];

    const searchBox = fields.find(
      (f) =>
        f.inputType === 'search' ||
        /search|query|find|vetuku|dhundo/i.test(f.label || '') ||
        /search|query|q/i.test(f.selector)
    );

    if (!searchBox) {
      const msg = isTelugu ? 'శోధన పెట్టె కనుగొనబడలేదు.' : 'Could not find a search box on this page.';
      return { success: false, action: 'find_search', speechText: msg };
    }

    await this.highlightElement(searchBox.selector, 'Search Box');
    this.state.currentElement = searchBox;
    this.emitState();

    const speech = isTelugu
      ? `శోధన పెట్టె కనుగొనబడింది: "${searchBox.label}". మీరు దేని కోసం వెతకాలనుకుంటున్నారు?`
      : isHinglish
        ? `Search box mil gaya: "${searchBox.label}". Kya search karna hai?`
        : `Found search box: "${searchBox.label}". What would you like to search for?`;

    return {
      success: true,
      action: 'find_search',
      element: searchBox,
      speechText: speech,
    };
  }

  private async performSiteSearch(
    query: string,
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const fields = this.currentStructure?.formFields || [];

    const searchBox = fields.find(
      (f) =>
        f.inputType === 'search' ||
        /search|query|find/i.test(f.label || '') ||
        /search|query|q/i.test(f.selector)
    ) || fields[0];

    if (!searchBox) {
      return { success: false, action: 'search', speechText: 'No search input found on this page.' };
    }

    await this.highlightElement(searchBox.selector, 'Searching...');
    await this.browserWindow?.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('${searchBox.selector}');
        if (el) {
          el.value = ${JSON.stringify(query)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          // Submit form if inside form
          if (el.form) el.form.submit();
          else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        }
      })();
    `);

    const speech = isTelugu
      ? `"${query}" కోసం శోధిస్తున్నాను.`
      : isHinglish
        ? `"${query}" search kar raha hoon.`
        : `Searching for "${query}".`;

    return { success: true, action: 'search', speechText: speech };
  }

  private async fillFormField(
    fieldName: string,
    fieldValue: string,
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const fields = this.currentStructure?.formFields || [];

    const targetField = fields.find((f) =>
      new RegExp(fieldName, 'i').test(f.label || f.placeholder || '')
    );

    if (!targetField) {
      const msg = `Could not find form field for "${fieldName}".`;
      return { success: false, action: 'fill_field', speechText: msg };
    }

    // STRICT PRIVACY AND SECURITY REQUIREMENT: Never autofill passwords or sensitive credentials
    if (targetField.isSensitive) {
      const warning = isTelugu
        ? 'మీ భద్రత కోసం, నేను పాస్‌వర్డ్‌లను ఆటోమేటిక్‌గా నమోదు చేయను. దయచేసి స్వయంగా టైప్ చేయండి.'
        : isHinglish
          ? 'Security ke liye main password autofill nahi kar sakta. Kripya khud type karein.'
          : 'For your security and privacy, I cannot fill in passwords or sensitive credentials automatically. Please type your password directly.';
      return { success: false, action: 'fill_field', speechText: warning };
    }

    await this.highlightElement(targetField.selector, `Filling: ${fieldName}`);
    await this.browserWindow?.webContents.executeJavaScript(`
      window.__fridaySetValue && window.__fridaySetValue('${targetField.selector}', ${JSON.stringify(fieldValue)});
    `);

    const speech = isTelugu
      ? `"${targetField.label}" లో "${fieldValue}" నమోదు చేసాను.`
      : isHinglish
        ? `"${targetField.label}" me "${fieldValue}" bhar diya.`
        : `Filled ${targetField.label} with "${fieldValue}".`;

    return { success: true, action: 'fill_field', element: targetField, speechText: speech };
  }

  private async findAndClick(
    query: string,
    isTelugu: boolean,
    isHinglish: boolean
  ): Promise<AccessibilityCommandResult> {
    await this.extractPageStructure();
    const interactive = [
      ...(this.currentStructure?.buttons || []),
      ...(this.currentStructure?.links || []),
    ];

    const cleanQuery = query.toLowerCase().trim();
    const matches = interactive.filter((item) =>
      (item.label || item.text || '').toLowerCase().includes(cleanQuery)
    );

    if (matches.length === 0) {
      const msg = isTelugu
        ? `"${query}" పేరుతో బటన్ లేదా లింక్ కనుగొనబడలేదు.`
        : isHinglish
          ? `"${query}" button ya link nahi mila.`
          : `I could not find a button or link called "${query}".`;
      return { success: false, action: 'click', speechText: msg };
    }

    // Disambiguation if multiple elements match
    if (matches.length > 1) {
      this.pendingDisambiguation = { command: 'click', options: matches.slice(0, 3) };
      const optionsText = matches
        .slice(0, 3)
        .map((m, i) => `${i + 1}. ${m.type} "${m.label || m.text}"`)
        .join(', ');

      const disambigPrompt = isTelugu
        ? `"${query}" కి సరిపోయే ${matches.length} ఎంపికలు దొరికాయి: ${optionsText}. మీరు దేనిని క్లిక్ చేయమంటారు?`
        : isHinglish
          ? `"${query}" ke liye ${matches.length} matches mile: ${optionsText}. Konsa click karun?`
          : `I found ${matches.length} matches for "${query}": ${optionsText}. Which one should I click?`;

      return {
        success: true,
        action: 'disambiguation',
        needsDisambiguation: true,
        options: matches.slice(0, 3).map((m) => m.label || m.text),
        speechText: disambigPrompt,
      };
    }

    return await this.clickElement(matches[0]);
  }

  private async clickElement(element: WebsiteElement): Promise<AccessibilityCommandResult> {
    // If element is a sensitive submission, ask confirmation
    if (element.text.toLowerCase().includes('delete') || element.text.toLowerCase().includes('pay') || element.text.toLowerCase().includes('buy')) {
      if (this.confirmationRequester) {
        const confirmed = await this.confirmationRequester(`FRIDAY is about to click "${element.text}". Do you confirm?`);
        if (!confirmed) {
          return { success: false, action: 'click', speechText: 'Action cancelled by user.' };
        }
      }
    }

    await this.highlightElement(element.selector, `Clicking: ${element.label || element.text}`);
    await this.browserWindow?.webContents.executeJavaScript(
      `window.__fridayClick && window.__fridayClick('${element.selector}')`
    );

    this.state.statusMessage = `Clicked: ${element.label || element.text}`;
    this.emitState();

    return {
      success: true,
      action: 'click',
      element,
      speechText: `Clicked ${element.label || element.text}.`,
    };
  }

  private explainActiveElement(
    isTelugu: boolean,
    isHinglish: boolean
  ): AccessibilityCommandResult {
    const el = this.state.currentElement;
    if (!el) {
      return { success: false, action: 'explain', speechText: 'No element currently has focus.' };
    }

    const typeDesc = el.type === 'button' ? 'button' : el.type === 'form_field' ? `input field (${el.inputType})` : el.type;
    const extra = el.isRequired ? ' It is required.' : '';
    const val = el.inputValue ? ` Current value is "${el.inputValue}".` : '';

    const speech = isTelugu
      ? `ఇది ${typeDesc} "${el.label || el.text}".${extra}${val}`
      : isHinglish
        ? `Yeh ek ${typeDesc} hai "${el.label || el.text}".${extra}${val}`
        : `This is a ${typeDesc} labeled "${el.label || el.text}".${extra}${val}`;

    return { success: true, action: 'explain', speechText: speech };
  }

  private async highlightElement(selector: string, badgeText: string): Promise<void> {
    if (!this.browserWindow || this.browserWindow.isDestroyed()) return;
    try {
      await this.browserWindow.webContents.executeJavaScript(
        `window.__fridayHighlight && window.__fridayHighlight('${selector}', ${JSON.stringify(badgeText)})`
      );
    } catch {
      // Ignore injection error
    }
  }

  private emitState(): void {
    this.emit('state-changed', this.getState());
  }
}

export const websiteAccessibilityService = new WebsiteAccessibilityService();
