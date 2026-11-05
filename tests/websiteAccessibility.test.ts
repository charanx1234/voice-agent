import { describe, expect, it, beforeEach } from 'vitest';
import { WebsiteAccessibilityService } from '../src/services/accessibility/websiteAccessibilityService';

describe('WebsiteAccessibilityService', () => {
  let service: WebsiteAccessibilityService;

  beforeEach(() => {
    service = new WebsiteAccessibilityService();
  });

  describe('State and Reading Controls', () => {
    it('initializes with default state and allows toggling enabled status', async () => {
      const state = service.getState();
      expect(state.enabled).toBe(false);
      expect(state.readingSpeed).toBe(1.0);
      expect(state.readingStatus).toBe('idle');

      // Speed clamping
      expect(service.setReadingSpeed(1.5)).toBe(1.5);
      expect(service.setReadingSpeed(0.2)).toBe(0.5); // minimum clamp
      expect(service.setReadingSpeed(3.0)).toBe(2.5); // maximum clamp
    });

    it('handles pause, resume, and stop reading gracefully', () => {
      expect(service.pauseReading()).toBe(false); // cannot pause when idle
      service.stopReading();
      expect(service.getState().readingStatus).toBe('idle');
    });
  });

  describe('Natural Voice Commands (English, Telugu, Hinglish)', () => {
    it('processes reading and control commands in English', async () => {
      const stopRes = await service.executeNaturalCommand('stop reading');
      expect(stopRes.success).toBe(true);
      expect(stopRes.action).toBe('stop_reading');
      expect(stopRes.speechText).toContain('Stopped reading');

      const speedRes = await service.executeNaturalCommand('read more slowly');
      expect(speedRes.success).toBe(true);
      expect(speedRes.action).toBe('set_speed');
      expect(speedRes.speechText).toContain('Reading speed decreased');

      const fasterRes = await service.executeNaturalCommand('read faster');
      expect(fasterRes.success).toBe(true);
      expect(fasterRes.action).toBe('set_speed');
      expect(fasterRes.speechText).toContain('Reading speed increased');
    });

    it('processes natural voice commands in Telugu', async () => {
      const teluguStop = await service.executeNaturalCommand('చదవడం ఆపు', 'te-IN');
      expect(teluguStop.success).toBe(true);
      expect(teluguStop.action).toBe('stop_reading');
      expect(teluguStop.speechText).toContain('చదవడం ఆపాను');

      const teluguSlower = await service.executeNaturalCommand('నెమ్మదిగా చదువు', 'te-IN');
      expect(teluguSlower.success).toBe(true);
      expect(teluguSlower.action).toBe('set_speed');
      expect(teluguSlower.speechText).toContain('తగ్గించాను');

      const teluguFaster = await service.executeNaturalCommand('వేగంగా చదువు', 'te-IN');
      expect(teluguFaster.success).toBe(true);
      expect(teluguFaster.action).toBe('set_speed');
      expect(teluguFaster.speechText).toContain('పెంచాను');
    });

    it('processes natural voice commands in Hinglish', async () => {
      const hinglishStop = await service.executeNaturalCommand('padhna band karo');
      expect(hinglishStop.success).toBe(true);
      expect(hinglishStop.action).toBe('stop_reading');
      expect(hinglishStop.speechText).toContain('Padhna band');

      const hinglishSlower = await service.executeNaturalCommand('dheere padho');
      expect(hinglishSlower.success).toBe(true);
      expect(hinglishSlower.action).toBe('set_speed');
      expect(hinglishSlower.speechText).toContain('Speed kam');

      const hinglishFaster = await service.executeNaturalCommand('tez padho');
      expect(hinglishFaster.success).toBe(true);
      expect(hinglishFaster.action).toBe('set_speed');
      expect(hinglishFaster.speechText).toContain('Speed badha');
    });

    it('handles navigation intent recognition across languages', async () => {
      // Heading navigation in English
      const engHeading = await service.executeNaturalCommand('next heading');
      expect(engHeading.action).toBe('navigate_heading');

      // Heading navigation in Telugu
      const teHeading = await service.executeNaturalCommand('తర్వాతి హెడ్డింగ్‌కి వెళ్ళు', 'te-IN');
      expect(teHeading.action).toBe('navigate_heading');

      // Heading navigation in Hinglish
      const hiHeading = await service.executeNaturalCommand('agla heading pe jao');
      expect(hiHeading.action).toBe('navigate_heading');

      // Paragraph navigation
      const engPara = await service.executeNaturalCommand('read next paragraph');
      expect(engPara.action).toBe('navigate_paragraph');

      // Summary commands
      const engSumm = await service.executeNaturalCommand('summarize this website');
      expect(engSumm.action).toBe('summarize');

      const teSumm = await service.executeNaturalCommand('సారాంశం చెప్పు', 'te-IN');
      expect(teSumm.action).toBe('summarize');

      const hiSumm = await service.executeNaturalCommand('summary batao');
      expect(hiSumm.action).toBe('summarize');
    });

    it('protects privacy by refusing to autofill passwords or sensitive fields', async () => {
      // Mock page structure with a password field
      (service as any).currentStructure = {
        url: 'https://example.com/login',
        title: 'Login Page',
        headings: [],
        paragraphs: [],
        buttons: [],
        links: [],
        formFields: [
          {
            id: 'field_0',
            type: 'form_field',
            tagName: 'input',
            text: 'Password',
            label: 'Password',
            inputType: 'password',
            inputValue: '••••••',
            isSensitive: true,
            selector: 'input[type="password"]',
            index: 0,
          },
        ],
        interactiveCount: 1,
      };

      const fillPasswordAttempt = await service.executeNaturalCommand('fill password secret123');
      expect(fillPasswordAttempt.success).toBe(false);
      expect(fillPasswordAttempt.action).toBe('fill_field');
      expect(fillPasswordAttempt.speechText).toContain('cannot fill in passwords');
    });
  });
});
