const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const SOURCE_URL = "https://www.snow-forecast.com/resorts/Dizin/6day/top";
const OUTPUT = path.join(process.cwd(), "data.js");
const PERIODS = ["AM", "PM", "night"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function number(text) {
  const n = Number.parseFloat(String(text || "").replace(/[^0-9+.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function rowCells($, rowName, count) {
  const row = $('table tr[data-row="' + rowName + '"]');
  let cells = row.find("td").map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get();
  if (cells.length < count) {
    cells = row.children().map((_, el) => $(el).text().replace(/\s+/g, " ").trim()).get();
  }
  // Keep empty cells so every metric remains aligned with its forecast period.
  return cells.slice(-count);
}

function normalizeDay(text) {
  const raw = String(text || "").trim().split(/\s+/)[0].toLowerCase();
  return WEEKDAYS.find((day) => day.toLowerCase().startsWith(raw)) || null;
}

function previousDay(day) {
  const i = WEEKDAYS.indexOf(day);
  return WEEKDAYS[(i + 6) % 7];
}

function tehranToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 12));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function dateKey(date) {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function nearestDateForWeekday(targetDay, around) {
  const targetIndex = WEEKDAYS.indexOf(targetDay);
  let best = null;
  for (let offset = -3; offset <= 3; offset++) {
    const d = addDays(around, offset);
    if (d.getUTCDay() !== targetIndex) continue;
    const score = Math.abs(offset) + (offset > 1 ? 0.5 : 0);
    if (!best || score < best.score) best = { date: d, score };
  }
  if (!best) throw new Error("Could not align Snow-Forecast headings with Tehran date");
  return best.date;
}

function persianDay(date) {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "UTC",
    weekday: "long"
  }).format(date);
}

function persianDate(date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "UTC",
    month: "long",
    day: "numeric"
  }).format(date);
}

function conditionRank(summary = "") {
  const s = summary.toLowerCase();
  if (s.includes("thunder")) return 9;
  if (s.includes("heavy snow")) return 8;
  if (s.includes("snow")) return 7;
  if (s.includes("heavy rain")) return 6;
  if (s.includes("rain")) return 5;
  if (s.includes("cloud")) return 3;
  if (s.includes("clear")) return 1;
  return 2;
}

function conditionIcon(summary = "") {
  const s = summary.toLowerCase();
  if (s.includes("thunder")) return "⛈️";
  if (s.includes("heavy snow")) return "❄️";
  if (s.includes("snow")) return "🌨️";
  if (s.includes("heavy rain")) return "🌧️";
  if (s.includes("rain")) return "🌦️";
  if (s.includes("cloud")) return "🌤️";
  if (s.includes("clear")) return "☀️";
  return "🌤️";
}

function conditionLabel(summary = "") {
  const s = summary.toLowerCase();
  if (s.includes("thunder")) return "رعدوبرق";
  if (s.includes("heavy snow")) return "بارش سنگین برف";
  if (s.includes("snow shwr")) return "رگبار برف";
  if (s.includes("snow")) return "برفی";
  if (s.includes("heavy rain")) return "بارش شدید باران";
  if (s.includes("rain shwr")) return "رگبار باران";
  if (s.includes("light rain")) return "باران سبک";
  if (s.includes("rain")) return "بارانی";
  if (s.includes("some cloud")) return "کمی ابری";
  if (s.includes("cloud")) return "ابری";
  if (s.includes("clear")) return "صاف";
  return "متغیر";
}

function toMetric(value, kind, isMetric) {
  if (value == null || isMetric) return value;
  if (kind === "temp") return Math.round(((value - 32) * 5 / 9) * 10) / 10;
  if (kind === "wind") return Math.round(value * 1.60934);
  if (kind === "snow") return Math.round(value * 2.54 * 10) / 10;
  return value;
}

function values(cells, key) {
  return cells.map((c) => c[key]).filter(Number.isFinite);
}

function average(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function summarizeDay(date, cells) {
  const maxTemps = values(cells, "maxTemp");
  const chills = values(cells, "windChill");
  const winds = values(cells, "wind");
  const humidities = values(cells, "humidity");
  const snow = values(cells, "snow").reduce((a, b) => a + b, 0);
  const condition = [...cells].sort(
    (a, b) => conditionRank(b.summary) - conditionRank(a.summary)
  )[0]?.summary || "";

  return {
    isoDate: date.toISOString().slice(0, 10),
    day: persianDay(date),
    date: persianDate(date),
    icon: conditionIcon(condition),
    condition: conditionLabel(condition),
    temp: maxTemps.length ? Math.round(Math.max(...maxTemps)) : null,
    feels: chills.length ? Math.round(Math.min(...chills)) : null,
    wind: winds.length ? Math.round(Math.max(...winds)) : null,
    snow: Math.round(snow * 10) / 10,
    humidity: humidities.length ? Math.round(average(humidities)) : null
  };
}

(async () => {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DizinWeatherBot/1.1; +https://github.com/erfanchgh/dizin-weather-system)",
      "accept-language": "en-US,en;q=0.9"
    }
  });
  if (!response.ok) throw new Error(`Snow-Forecast HTTP ${response.status}`);

  const html = await response.text();
  const $ = cheerio.load(html);

  let periods = $(".forecast-table-time__period").map((_, el) => $(el).text().trim()).get();
  if (!periods.length) {
    periods = ($('table tr[data-row="time"]').text().match(/AM|PM|night/gi) || [])
      .map((p) => p.toLowerCase() === "night" ? "night" : p.toUpperCase());
  }

  const dayNames = $(".forecast-table-days__name").map((_, el) => $(el).text().trim()).get();
  const periodCount = periods.length;
  const summaries = rowCells($, "phrases", periodCount);
  const winds = rowCells($, "wind", periodCount).map(number);
  const snows = rowCells($, "snow", periodCount).map((v) => number(v) || 0);
  const maxTemps = rowCells($, "temperature-max", periodCount).map(number);
  const minTemps = rowCells($, "temperature-min", periodCount).map(number);
  const chills = rowCells($, "temperature-chill", periodCount).map(number);
  const humidities = rowCells($, "humidity", periodCount).map(number);

  const firstTimeRaw = periods[0];
  const firstTime = PERIODS.find((p) => p.toLowerCase() === String(firstTimeRaw).toLowerCase());
  const firstDisplayedDay = normalizeDay(dayNames[0]);

  if (!firstTime || !firstDisplayedDay) {
    throw new Error(`Could not parse forecast header (time=${firstTimeRaw}, day=${dayNames[0]})`);
  }

  const firstCellDay = firstTime === "night" ? previousDay(firstDisplayedDay) : firstDisplayedDay;
  const today = tehranToday();
  const baseDate = nearestDateForWeekday(firstCellDay, today);
  const timeOffset = PERIODS.indexOf(firstTime);

  const isMetric = $(".deg-c input").attr("checked") === "checked" ||
                   /km\/h/.test($('table tr[data-row="wind"]').text());

  const counts = [periods.length, summaries.length, winds.length, maxTemps.length, chills.length]
    .filter((n) => n > 0);
  const cellCount = Math.min(18, ...counts);
  if (!Number.isFinite(cellCount) || cellCount < 6) {
    throw new Error("Forecast table is incomplete");
  }

  const cells = [];
  for (let i = 0; i < cellCount; i++) {
    const dayOffset = Math.floor((timeOffset + i) / 3);
    const date = addDays(baseDate, dayOffset);
    cells.push({
      date,
      period: PERIODS[(timeOffset + i) % 3],
      summary: summaries[i] || "",
      wind: toMetric(winds[i], "wind", isMetric),
      snow: toMetric(snows[i] || 0, "snow", isMetric) || 0,
      maxTemp: toMetric(maxTemps[i], "temp", isMetric),
      minTemp: toMetric(minTemps[i], "temp", isMetric),
      windChill: toMetric(chills[i], "temp", isMetric),
      humidity: humidities[i]
    });
  }

  const grouped = new Map();
  for (const cell of cells) {
    const key = dateKey(cell.date);
    if (!grouped.has(key)) grouped.set(key, { date: cell.date, cells: [] });
    grouped.get(key).cells.push(cell);
  }

  // At 19:00 Tehran the story is for tomorrow + the following two days.
  const todayKey = dateKey(today);
  const days = [...grouped.values()]
    .filter((g) => dateKey(g.date) > todayKey)
    .slice(0, 3)
    .map((g) => summarizeDay(g.date, g.cells));

  if (days.length < 3) throw new Error("Fewer than three future forecast days were parsed");

  for (let i = 0; i < 3; i++) {
    if (days[i].isoDate !== addDays(today, i + 1).toISOString().slice(0, 10))
      throw new Error("Forecast must cover exactly tomorrow and the next two days");
    if (![days[i].temp, days[i].feels, days[i].wind, days[i].humidity].every(Number.isFinite))
      throw new Error("Required summit weather metrics are missing");
  }

  // The summit forecast is a model forecast, not a live station observation.
  // Select today's period corresponding to the Tehran clock, never tomorrow's card.
  const tehranHour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran", hour: "2-digit", hourCycle: "h23"
  }).format(new Date()));
  const currentPeriod = tehranHour < 12 ? "AM" : tehranHour < 18 ? "PM" : "night";
  const currentCell = cells.find(c => dateKey(c.date) === todayKey && c.period === currentPeriod);
  const current = currentCell ? {
    ...summarizeDay(today, [currentCell]),
    kind: "summit-period-forecast",
    period: currentPeriod
  } : null;

  const payload = {
    summitElevation: 3599,
    title: "پیش‌بینی ۳ روز آینده",
    note: "شرایط جوی کوهستان متغیر است. پیش از حرکت، آخرین وضعیت هوا و باز بودن مسیرها را بررسی کنید.",
    source: "Snow-Forecast.com",
    sourceUrl: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    current,
    days
  };

  fs.writeFileSync(
    OUTPUT,
    `window.DIZIN_WEATHER = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8"
  );

  console.log("Updated Dizin 3-day summit forecast:", JSON.stringify(days));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
