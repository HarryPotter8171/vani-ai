async function geocode(location) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  const hit = data?.results?.[0];
  if (!hit) throw new Error(`Location not found: ${location}`);
  return {
    name: hit.name,
    country: hit.country,
    admin1: hit.admin1,
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone,
  };
}

async function fetchWeather(place) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(place.latitude));
  url.searchParams.set("longitude", String(place.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation"
  );
  url.searchParams.set("timezone", place.timezone || "auto");

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
  return res.json();
}

const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};

export const weatherTool = {
  id: "weather",
  name: "weather",
  displayName: "Weather",
  description:
    "Get current weather for a city or place. Use whenever the user asks about temperature, rain, forecast conditions, or weather outside.",
  schema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "City or place name, e.g. 'Mumbai', 'San Francisco', 'London'",
      },
    },
    required: ["location"],
    additionalProperties: false,
  },
  async execute(args = {}) {
    const location = String(args.location || "").trim();
    if (!location) return { ok: false, error: "Location is required" };

    try {
      const place = await geocode(location);
      const data = await fetchWeather(place);
      const current = data.current || {};
      return {
        ok: true,
        location: {
          name: place.name,
          region: place.admin1,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude,
          timezone: place.timezone,
        },
        current: {
          time: current.time,
          temperatureC: current.temperature_2m,
          feelsLikeC: current.apparent_temperature,
          humidityPercent: current.relative_humidity_2m,
          windSpeedKmh: current.wind_speed_10m,
          precipitationMm: current.precipitation,
          condition: WEATHER_CODES[current.weather_code] || `Code ${current.weather_code}`,
          weatherCode: current.weather_code,
        },
        source: "Open-Meteo",
      };
    } catch (err) {
      return { ok: false, error: err.message || "Weather lookup failed", location };
    }
  },
};
