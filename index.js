/* ============================================================
   WeatherNow — index.js
   Modern, accessible, well-structured JS (ES2022+)
   ============================================================ */

'use strict';

// ── Constants ────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 8000; // 8 s — dismiss loading if API hangs

// ── Config ──────────────────────────────────────────────────
const API_KEY = 'be4eb5ecde063fa63e5488572dc5bf5f';
const BASE_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const DEFAULT_CITY = 'Cape Town';

// ── State ────────────────────────────────────────────────────
let currentUnit      = 'C';   // 'C' | 'F'
let lastFetchedData  = null;  // cache last API response
let weatherBg        = null;  // WeatherBackground instance (set on DOMContentLoaded)

// ── DOM refs ─────────────────────────────────────────────────
const searchForm       = document.getElementById('search-form');
const cityInput        = document.getElementById('city-input');
const todayDayEl       = document.getElementById('today-day');
const todayDateEl      = document.getElementById('today-date');
const todayLocationEl  = document.getElementById('today-location');
const mainWeatherIcon  = document.getElementById('main-weather-icon');
const weatherTempEl    = document.getElementById('weather-temp');
const weatherDescEl    = document.getElementById('weather-desc');
const statPrecipEl     = document.getElementById('stat-precip');
const statHumidityEl   = document.getElementById('stat-humidity');
const statWindEl       = document.getElementById('stat-wind');
const statFeelsEl      = document.getElementById('stat-feels');
const daysListEl       = document.getElementById('days-list');
const noticeEl         = document.getElementById('notice');
const noticeTextEl     = document.getElementById('notice-text');
const loadingOverlay   = document.getElementById('loading-overlay');
const btnCelsius       = document.getElementById('btn-celsius');
const btnFahrenheit    = document.getElementById('btn-fahrenheit');
const warningsEl       = document.getElementById('warnings-container');

// ── Warnings engine ────────────────────────────────────────────

/**
 * Evaluate live weather data and return an array of warning objects.
 * All temperature thresholds are in Celsius (API always returns metric).
 * @param {object} data - OWM forecast API response
 * @returns {{ level: string, icon: string, title: string, message: string }[]}
 */
function generateWarnings(data) {
  const current   = data.list[0];
  const temp      = current.main.temp;
  const feelsLike = current.main.feels_like;
  const humidity  = current.main.humidity;
  const windKph   = Math.round(current.wind.speed * 3.6);
  const popPct    = Math.round((current.pop ?? 0) * 100);
  const icon      = current.weather[0].icon;
  const warnings  = [];

  // ─ Heat ────────────────────────────────────────────────
  if (feelsLike >= 40 || temp >= 38) {
    warnings.push({
      level: 'danger', icon: 'bxs-sun',
      title: 'Extreme Heat Alert',
      message: `Feels like ${formatTemp(feelsLike)} outside. Avoid direct sun between 11am–3pm. Drink water every 30 minutes and stay in the shade. Watch for signs of heatstroke.`,
    });
  } else if (feelsLike >= 33 || temp >= 30) {
    warnings.push({
      level: 'caution', icon: 'bxs-sun',
      title: 'Very Hot Today',
      message: `It’s very hot outside at ${formatTemp(temp)}. Drink an extra glass of water every hour, apply sunscreen (SPF 30+), and wear light clothing.`,
    });
  }

  // ─ Cold & Frost ──────────────────────────────────────
  if (feelsLike <= -10) {
    warnings.push({
      level: 'danger', icon: 'bx-wind',
      title: 'Extreme Cold Warning',
      message: `Feels like ${formatTemp(feelsLike)} — frostbite risk on exposed skin within minutes. Limit time outdoors. Cover all extremities and wear thermal layers.`,
    });
  } else if (temp <= 0) {
    warnings.push({
      level: 'danger', icon: 'bxs-droplet',
      title: 'Freezing Temperatures — Ice Risk',
      message: `Temperature is at or below 0°C. The pavement and roads outside your door may be icy. Walk carefully, drive slowly, and wear grip-soled shoes.`,
    });
  } else if (temp > 0 && temp <= 3) {
    warnings.push({
      level: 'caution', icon: 'bxs-droplet',
      title: 'Near-Freezing — Possible Ice',
      message: `Near-freezing temperatures mean puddles and shaded spots may be icy. Watch your step and allow extra travel time if driving.`,
    });
  } else if (feelsLike <= 5) {
    warnings.push({
      level: 'caution', icon: 'bx-wind',
      title: 'Bitterly Cold Wind Chill',
      message: `It feels like ${formatTemp(feelsLike)} outside once wind chill is factored in. Wear a hat, gloves, and a windproof coat before heading out.`,
    });
  }

  // ─ Thunderstorm ───────────────────────────────────────
  if (/^11/.test(icon)) {
    warnings.push({
      level: 'danger', icon: 'bxs-bolt',
      title: 'Thunderstorm Warning',
      message: 'Lightning strikes are possible. Seek shelter in a sturdy building immediately. Avoid open fields, tall trees, hilltops, and bodies of water until the storm passes.',
    });
  }

  // ─ Snow ─────────────────────────────────────────────
  if (/^13/.test(icon)) {
    warnings.push({
      level: 'caution', icon: 'bx-cloud-snow',
      title: 'Snowfall Expected',
      message: 'Snow is falling or expected soon. Roads and pavements may be slippery. Drive at reduced speed, allow double the stopping distance, and wear waterproof, grip-soled footwear.',
    });
  }

  // ─ Rain (moderate / heavy) ───────────────────────────
  if (/^10/.test(icon)) {
    if (popPct >= 70) {
      warnings.push({
        level: 'caution', icon: 'bx-cloud-rain',
        title: 'Heavy Rain Expected',
        message: `${popPct}% chance of rain. Grab an umbrella and waterproof footwear before you head out. Watch for surface flooding on low-lying roads.`,
      });
    } else {
      warnings.push({
        level: 'info', icon: 'bx-cloud-rain',
        title: 'Rain Likely Today',
        message: `Rain is in the forecast. A compact umbrella or raincoat will keep you dry — easy to forget until you’re already outside!`,
      });
    }
  }

  // ─ Drizzle ──────────────────────────────────────────
  if (/^09/.test(icon)) {
    warnings.push({
      level: 'info', icon: 'bx-cloud-rain',
      title: 'Light Drizzle',
      message: 'There’s a light drizzle outside — easy to underestimate! A compact umbrella or a water-resistant jacket is all you need.',
    });
  }

  // ─ Fog / Low visibility ─────────────────────────────
  if (/^50/.test(icon)) {
    warnings.push({
      level: 'caution', icon: 'bx-water',
      title: 'Low Visibility — Foggy Conditions',
      message: 'Dense fog may significantly reduce visibility. Use low-beam headlights, leave extra following distance, and drive well below the speed limit.',
    });
  }

  // ─ Wind ──────────────────────────────────────────────
  if (windKph >= 80) {
    warnings.push({
      level: 'danger', icon: 'bx-wind',
      title: 'Dangerous Wind Speeds',
      message: `Wind gusts of ${windKph} km/h expected. Stay indoors where possible. Flying debris is a serious hazard. Avoid trees, scaffolding, and flimsy structures.`,
    });
  } else if (windKph >= 50) {
    warnings.push({
      level: 'caution', icon: 'bx-wind',
      title: 'Strong Winds',
      message: `Winds of ${windKph} km/h today. Secure any loose furniture or items outside. Hold on to your hat, and extra care on exposed bridges or hillsides!`,
    });
  }

  // ─ Heat + Humidity combo ─────────────────────────────
  if (humidity >= 80 && temp >= 25) {
    warnings.push({
      level: 'info', icon: 'bx-water',
      title: 'High Humidity',
      message: `Humidity is at ${humidity}%. Combined with the heat, it will feel muggy and oppressive — your body will sweat more. Stay cool, hydrated, and take breaks indoors.`,
    });
  }

  // ─ UV exposure (clear sunny day) ───────────────────────
  if (icon === '01d' && temp >= 18) {
    warnings.push({
      level: 'info', icon: 'bxs-sun',
      title: 'UV Exposure — Apply Sunscreen',
      message: `Clear skies mean strong UV rays, even on a short errand. Apply SPF 30+ sunscreen before heading out, and re-apply every 2 hours if you’re outside for a while.`,
    });
  }

  // ─ High rain probability (upcoming) ────────────────────
  // Only if no rain/drizzle already shown and pop is high
  const hasRainWarning = warnings.some(w => /rain|drizzle/i.test(w.title));
  if (!hasRainWarning && popPct >= 60) {
    warnings.push({
      level: 'info', icon: 'bxs-droplet',
      title: 'Chance of Showers',
      message: `There’s a ${popPct}% chance of showers later today. Consider taking a compact umbrella just in case.`,
    });
  }

  // ─ All clear fallback ──────────────────────────────────
  if (warnings.length === 0) {
    warnings.push({
      level: 'info', icon: 'bxs-leaf',
      title: 'All Clear — Good Conditions',
      message: 'No significant weather hazards today. A great opportunity to get outside, enjoy some fresh air, and top up on natural daylight!',
    });
  }

  return warnings;
}

/**
 * Render warning cards into the warnings container.
 * Clears previous warnings first.
 */
function renderWarnings() {
  if (!lastFetchedData) return;

  const items = generateWarnings(lastFetchedData);

  warningsEl.innerHTML = items.map((w, i) => `
    <div class="warning-card ${w.level}" role="alert" style="animation-delay:${i * 0.07}s">
      <div class="warning-icon-wrap" aria-hidden="true">
        <i class="bx ${w.icon} warning-icon"></i>
      </div>
      <div class="warning-body">
        <strong class="warning-title">${w.title}</strong>
        <p class="warning-msg">${w.message}</p>
      </div>
      <button class="warning-dismiss" aria-label="Dismiss: ${w.title}" onclick="this.closest('.warning-card').remove(); if(!document.querySelector('.warning-card')) warningsEl.hidden=true;">
        <i class="bx bx-x" aria-hidden="true"></i>
      </button>
    </div>
  `).join('');

  warningsEl.hidden = false;
}

// ── Weather icon map (OWM icon codes → Boxicons names) ───────
const ICON_MAP = {
  '01d': 'bx-sun',
  '01n': 'bx-moon',
  '02d': 'bxs-cloud-lightning',
  '02n': 'bxs-cloud-lightning',
  '03d': 'bx-cloud',
  '03n': 'bx-cloud',
  '04d': 'bx-cloud',
  '04n': 'bx-cloud',
  '09d': 'bx-cloud-rain',
  '09n': 'bx-cloud-rain',
  '10d': 'bx-cloud-rain',
  '10n': 'bx-cloud-rain',
  '11d': 'bx-cloud-lightning',
  '11n': 'bx-cloud-lightning',
  '13d': 'bx-cloud-snow',
  '13n': 'bx-cloud-snow',
  '50d': 'bx-water',
  '50n': 'bx-water',
};

// ── Helpers ───────────────────────────────────────────────────

/**
 * Convert Celsius to Fahrenheit.
 * @param {number} c
 * @returns {number}
 */
function toF(c) {
  return Math.round(c * 9 / 5 + 32);
}

/**
 * Format a temperature value according to the current unit.
 * @param {number} celsius - Temperature in Celsius.
 * @returns {string}
 */
function formatTemp(celsius) {
  const value = currentUnit === 'C' ? Math.round(celsius) : toF(celsius);
  return `${value}°${currentUnit}`;
}

/**
 * Return the Boxicons class string for a given OWM icon code.
 * @param {string} code
 * @returns {string}
 */
function iconClass(code) {
  return `bx ${ICON_MAP[code] ?? 'bx-cloud'}`;
}

/**
 * Show or hide the loading overlay.
 * @param {boolean} visible
 */
function setLoading(visible) {
  loadingOverlay.hidden = !visible;
  loadingOverlay.setAttribute('aria-hidden', String(!visible));
  // Toggle spinner on the search button too
  const btn = document.getElementById('search-submit-btn');
  if (btn) btn.classList.toggle('loading', visible);
}

/**
 * Show an inline error notice.
 * @param {string} message
 */
function showNotice(message) {
  noticeTextEl.textContent = message;
  noticeEl.hidden = false;
}

/** Hide the inline error notice */
function hideNotice() {
  noticeEl.hidden = true;
}

/**
 * Format today's date parts for display.
 * @returns {{ day: string, date: string }}
 */
function getTodayStrings() {
  const now = new Date();
  return {
    day:  now.toLocaleDateString('en-US', { weekday: 'long' }),
    date: now.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

// ── Render functions ──────────────────────────────────────────

/**
 * Populate the left panel (current weather) from cached data.
 */
function renderCurrentWeather() {
  if (!lastFetchedData) return;

  const { city, list } = lastFetchedData;
  const current = list[0];

  // Date
  const { day, date } = getTodayStrings();
  todayDayEl.textContent  = day;
  todayDateEl.textContent = date;

  // Location
  todayLocationEl.textContent = `${city.name}, ${city.country}`;

  // Icon
  const iconCode = current.weather[0].icon;
  mainWeatherIcon.className = `weather-icon bx ${ICON_MAP[iconCode] ?? 'bx-cloud'}`;

  // Temperature & description
  weatherTempEl.textContent = formatTemp(current.main.temp);
  weatherDescEl.textContent = current.weather[0].description;

  // Stats
  const precipPct = Math.round((current.pop ?? 0) * 100);
  statPrecipEl.textContent   = `${precipPct}%`;
  statHumidityEl.textContent = `${current.main.humidity}%`;
  statWindEl.textContent     = `${Math.round(current.wind.speed * 3.6)} km/h`;
  statFeelsEl.textContent    = formatTemp(current.main.feels_like);

  // Update live weather canvas
  if (weatherBg) weatherBg.setCondition(iconCode);

  // Update proactive warnings
  renderWarnings();
}

/**
 * Populate the 4-day forecast strip.
 */
function renderForecast() {
  if (!lastFetchedData) return;

  const today = new Date().getDate();
  const seen  = new Set();
  const items = [];

  for (const entry of lastFetchedData.list) {
    const d = new Date(entry.dt_txt);
    const dayNum = d.getDate();
    if (dayNum === today) continue; // skip today
    const dayKey = d.toLocaleDateString('en-US', { weekday: 'short' });
    if (seen.has(dayKey)) continue;
    seen.add(dayKey);
    items.push({ dayKey, temp: entry.main.temp, iconCode: entry.weather[0].icon });
    if (items.length === 4) break;
  }

  daysListEl.innerHTML = items.map(({ dayKey, temp, iconCode }) => `
    <li>
      <i class="bx ${ICON_MAP[iconCode] ?? 'bx-cloud'}" aria-hidden="true"></i>
      <span class="day-name">${dayKey}</span>
      <span class="day-temp">${formatTemp(temp)}</span>
    </li>
  `).join('');
}

// ── Fetch ─────────────────────────────────────────────────────

/**
 * Fetch weather data from OWM for a given city name.
 * @param {string} city
 */
async function fetchWeather(city) {
  if (!city.trim()) return;

  setLoading(true);
  hideNotice();

  // Safety net: always dismiss loading after FETCH_TIMEOUT_MS even if fetch hangs
  const safetyTimer = setTimeout(() => {
    setLoading(false);
    showNotice('Request timed out. Check your connection and try again.');
  }, FETCH_TIMEOUT_MS + 500);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${BASE_URL}?q=${encodeURIComponent(city.trim())}&appid=${API_KEY}&units=metric`;
    const res  = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (res.status === 404) throw new Error(`City "${city}" not found. Please check the spelling.`);
      if (res.status === 401) throw new Error('API key invalid. Please check your configuration.');
      throw new Error(`Server error (${res.status}). Please try again later.`);
    }

    lastFetchedData = await res.json();
    renderCurrentWeather();
    renderForecast();

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      showNotice('Request timed out. Check your connection and try again.');
    } else {
      showNotice(err.message ?? 'Failed to fetch weather. Check your connection.');
    }
  } finally {
    clearTimeout(safetyTimer);
    setLoading(false);
  }
}

// ── Event listeners ───────────────────────────────────────────

// Search form submit
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const query = cityInput.value.trim();
  if (query) {
    fetchWeather(query);
    cityInput.blur();
  }
});

// Unit toggle
btnCelsius.addEventListener('click', () => {
  if (currentUnit === 'C') return;
  currentUnit = 'C';
  btnCelsius.classList.add('active');
  btnCelsius.setAttribute('aria-pressed', 'true');
  btnFahrenheit.classList.remove('active');
  btnFahrenheit.setAttribute('aria-pressed', 'false');
  renderCurrentWeather();
  renderForecast();
  renderWarnings();
});

btnFahrenheit.addEventListener('click', () => {
  if (currentUnit === 'F') return;
  currentUnit = 'F';
  btnFahrenheit.classList.add('active');
  btnFahrenheit.setAttribute('aria-pressed', 'true');
  btnCelsius.classList.remove('active');
  btnCelsius.setAttribute('aria-pressed', 'false');
  renderCurrentWeather();
  renderForecast();
  renderWarnings();
});

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Start the canvas animation engine
  weatherBg = new WeatherBackground('weather-canvas');

  fetchWeather(DEFAULT_CITY);
});