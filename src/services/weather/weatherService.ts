import { settingsStore } from '../storage/settingsStore';

export interface WeatherCondition {
  temperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  weatherCode: number;
  conditionText: string;
  rainProbabilityPercent?: number;
  maxTempC?: number;
  minTempC?: number;
}

export interface WeatherReport {
  success: boolean;
  city: string;
  country?: string;
  latitude: number;
  longitude: number;
  timeframe: 'current' | 'today' | 'tomorrow' | 'evening';
  current?: WeatherCondition;
  forecast?: WeatherCondition;
  formattedText: string;
  source: string;
  cached: boolean;
  timestamp: string;
  error?: string;
}

interface CacheEntry {
  report: WeatherReport;
  expiresAt: number;
}

/**
 * WMO Weather interpretation codes (WW)
 */
function decodeWmoWeather(code: number): string {
  switch (code) {
    case 0:
      return 'Clear sky';
    case 1:
      return 'Mainly clear';
    case 2:
      return 'Partly cloudy';
    case 3:
      return 'Overcast';
    case 45:
    case 48:
      return 'Foggy';
    case 51:
    case 53:
    case 55:
      return 'Light drizzle';
    case 56:
    case 57:
      return 'Freezing drizzle';
    case 61:
      return 'Slight rain';
    case 63:
      return 'Moderate rain';
    case 65:
      return 'Heavy rain';
    case 66:
    case 67:
      return 'Freezing rain';
    case 71:
    case 73:
    case 75:
      return 'Snowfall';
    case 77:
      return 'Snow grains';
    case 80:
      return 'Slight rain showers';
    case 81:
      return 'Moderate rain showers';
    case 82:
      return 'Violent rain showers';
    case 85:
    case 86:
      return 'Snow showers';
    case 95:
      return 'Thunderstorm';
    case 96:
    case 99:
      return 'Thunderstorm with slight or heavy hail';
    default:
      return 'Fair conditions';
  }
}

export class WeatherService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

  /**
   * Retrieves weather for a specific city or user default location.
   */
  public async getWeather(params: {
    city?: string;
    timeframe?: 'current' | 'today' | 'tomorrow' | 'evening';
  }): Promise<WeatherReport> {
    const timeframe = params.timeframe || 'current';
    const settings = settingsStore.getSettings();
    const city = (params.city || (settings as any).defaultLocation || 'Hyderabad').trim();

    const cacheKey = `${city.toLowerCase()}_${timeframe}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.report, cached: true };
    }

    try {
      // 1. Resolve coordinates via Open-Meteo Geocoding
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
      const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });
      if (!geoRes.ok) {
        return {
          success: false,
          city,
          latitude: 0,
          longitude: 0,
          timeframe,
          formattedText: `Could not retrieve location coordinates for "${city}". Please verify your internet connection.`,
          source: 'Open-Meteo',
          cached: false,
          timestamp: new Date().toISOString(),
          error: `Geocoding failed with status ${geoRes.status}`,
        };
      }

      const geoData: any = await geoRes.json();
      if (!geoData?.results || geoData.results.length === 0) {
        return {
          success: false,
          city,
          latitude: 0,
          longitude: 0,
          timeframe,
          formattedText: `I couldn't find a location matching "${city}". Could you please name the city again?`,
          source: 'Open-Meteo',
          cached: false,
          timestamp: new Date().toISOString(),
          error: 'Location not found',
        };
      }

      const place = geoData.results[0];
      const lat = place.latitude;
      const lon = place.longitude;
      const resolvedName = place.name;
      const country = place.country;

      // 2. Fetch live weather & forecast from Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=precipitation_probability,temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto`;
      const weatherRes = await fetch(weatherUrl, { signal: AbortSignal.timeout(6000) });
      if (!weatherRes.ok) {
        return {
          success: false,
          city: resolvedName,
          country,
          latitude: lat,
          longitude: lon,
          timeframe,
          formattedText: `Weather service returned an error (${weatherRes.status}). Please try again shortly.`,
          source: 'Open-Meteo',
          cached: false,
          timestamp: new Date().toISOString(),
          error: `Weather API failed with status ${weatherRes.status}`,
        };
      }

      const data: any = await weatherRes.json();

      // Current Conditions
      const curTemp = Math.round(Number(data?.current?.temperature_2m) * 10) / 10;
      const curHumidity = Math.round(Number(data?.current?.relative_humidity_2m) || 0);
      const curWind = Math.round(Number(data?.current?.wind_speed_10m) * 10) / 10;
      const curCode = Number(data?.current?.weather_code) ?? 0;
      const curCond = decodeWmoWeather(curCode);

      // Hourly rain probability for today
      const hourlyRain = Array.isArray(data?.hourly?.precipitation_probability)
        ? data.hourly.precipitation_probability
        : [];
      const todayMaxRain = Array.isArray(data?.daily?.precipitation_probability_max)
        ? Number(data.daily.precipitation_probability_max[0]) || 0
        : 0;

      const currentObj: WeatherCondition = {
        temperatureC: curTemp,
        humidityPercent: curHumidity,
        windSpeedKmh: curWind,
        weatherCode: curCode,
        conditionText: curCond,
        rainProbabilityPercent: todayMaxRain,
      };

      let formattedText = '';
      let forecastObj: WeatherCondition | undefined = undefined;

      if (timeframe === 'current') {
        const rainNote = todayMaxRain > 30 ? ` There is a ${todayMaxRain}% chance of rain today.` : '';
        formattedText = `In ${resolvedName}, it is currently ${curTemp}°C with ${curCond.toLowerCase()}. Humidity is ${curHumidity}% and wind is at ${curWind} km/h.${rainNote}`;
      } else if (timeframe === 'today') {
        const maxT = Math.round(Number(data?.daily?.temperature_2m_max?.[0]) || curTemp);
        const minT = Math.round(Number(data?.daily?.temperature_2m_min?.[0]) || curTemp);
        const dayCode = Number(data?.daily?.weather_code?.[0]) ?? curCode;
        const dayCond = decodeWmoWeather(dayCode);
        const willRain = todayMaxRain >= 40 ? `Rain is likely (${todayMaxRain}% chance).` : `Rain is unlikely (${todayMaxRain}% chance).`;

        forecastObj = {
          temperatureC: maxT,
          humidityPercent: curHumidity,
          windSpeedKmh: curWind,
          weatherCode: dayCode,
          conditionText: dayCond,
          rainProbabilityPercent: todayMaxRain,
          maxTempC: maxT,
          minTempC: minT,
        };

        formattedText = `Today's forecast for ${resolvedName}: high of ${maxT}°C, low of ${minT}°C with ${dayCond.toLowerCase()}. ${willRain}`;
      } else if (timeframe === 'tomorrow') {
        const maxT = Math.round(Number(data?.daily?.temperature_2m_max?.[1]) || curTemp);
        const minT = Math.round(Number(data?.daily?.temperature_2m_min?.[1]) || curTemp);
        const tomRain = Number(data?.daily?.precipitation_probability_max?.[1]) || 0;
        const tomCode = Number(data?.daily?.weather_code?.[1]) ?? 0;
        const tomCond = decodeWmoWeather(tomCode);
        const willRain = tomRain >= 40 ? `Bring an umbrella, there is a ${tomRain}% chance of rain.` : `No significant rain expected (${tomRain}% chance).`;

        forecastObj = {
          temperatureC: maxT,
          humidityPercent: 50,
          windSpeedKmh: curWind,
          weatherCode: tomCode,
          conditionText: tomCond,
          rainProbabilityPercent: tomRain,
          maxTempC: maxT,
          minTempC: minT,
        };

        formattedText = `Tomorrow in ${resolvedName}: expect ${tomCond.toLowerCase()} with a high of ${maxT}°C and low of ${minT}°C. ${willRain}`;
      } else if (timeframe === 'evening') {
        // Average evening hours (18:00 - 22:00)
        const eveRain = hourlyRain.slice(18, 23).reduce((acc: number, v: number) => Math.max(acc, v), 0);
        const eveTemps = (data?.hourly?.temperature_2m || []).slice(18, 23);
        const avgEveTemp = eveTemps.length > 0 ? Math.round(eveTemps.reduce((a: number, b: number) => a + b, 0) / eveTemps.length) : curTemp;
        const willRain = eveRain >= 40 ? `Yes, there is a ${eveRain}% chance of rain this evening.` : `Rain is unlikely this evening (${eveRain}% chance).`;

        forecastObj = {
          temperatureC: avgEveTemp,
          humidityPercent: curHumidity,
          windSpeedKmh: curWind,
          weatherCode: curCode,
          conditionText: curCond,
          rainProbabilityPercent: eveRain,
        };

        formattedText = `This evening in ${resolvedName}: temperatures around ${avgEveTemp}°C. ${willRain}`;
      }

      const report: WeatherReport = {
        success: true,
        city: resolvedName,
        country,
        latitude: lat,
        longitude: lon,
        timeframe,
        current: currentObj,
        forecast: forecastObj,
        formattedText,
        source: 'Open-Meteo',
        cached: false,
        timestamp: new Date().toISOString(),
      };

      // Save to cache
      this.cache.set(cacheKey, {
        report,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      return report;
    } catch (err: any) {
      return {
        success: false,
        city,
        latitude: 0,
        longitude: 0,
        timeframe,
        formattedText: `I couldn't fetch live weather right now. Please check your internet connection.`,
        source: 'Open-Meteo',
        cached: false,
        timestamp: new Date().toISOString(),
        error: err?.message || 'Network error',
      };
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const weatherService = new WeatherService();
