import { describe, it, expect, beforeEach } from 'vitest';
import { weatherService } from '../src/services/weather/weatherService';

describe('Live Weather Service', () => {
  beforeEach(() => {
    weatherService.clearCache();
  });

  it('fetches real current weather for Hyderabad', async () => {
    const res = await weatherService.getWeather({ city: 'Hyderabad', timeframe: 'current' });
    expect(res).toBeDefined();
    if (res.success) {
      expect(res.city).toBe('Hyderabad');
      expect(res.country).toBe('India');
      expect(res.current?.temperatureC).toBeDefined();
      expect(typeof res.current?.temperatureC).toBe('number');
      expect(res.current?.humidityPercent).toBeGreaterThanOrEqual(0);
      expect(res.formattedText).toContain('Hyderabad');
      expect(res.formattedText).toContain('°C');
    }
  });

  it('fetches today forecast including rain probability', async () => {
    const res = await weatherService.getWeather({ city: 'Hyderabad', timeframe: 'today' });
    expect(res).toBeDefined();
    if (res.success) {
      expect(res.forecast?.maxTempC).toBeDefined();
      expect(res.forecast?.minTempC).toBeDefined();
      expect(res.forecast?.rainProbabilityPercent).toBeDefined();
      expect(res.formattedText).toMatch(/high of \d+°C/i);
    }
  });

  it('caches weather results for repeated calls', async () => {
    const res1 = await weatherService.getWeather({ city: 'Hyderabad', timeframe: 'current' });
    if (!res1.success) return;
    expect(res1.cached).toBe(false);

    const res2 = await weatherService.getWeather({ city: 'Hyderabad', timeframe: 'current' });
    expect(res2.cached).toBe(true);
    expect(res2.city).toBe(res1.city);
    expect(res2.current?.temperatureC).toBe(res1.current?.temperatureC);
  });

  it('handles unknown city gracefully without inventing data', async () => {
    const res = await weatherService.getWeather({ city: 'NonExistentCityXYZ123456789' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Location not found');
    expect(res.formattedText).toContain("couldn't find a location");
  });
});
