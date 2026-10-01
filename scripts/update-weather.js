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
  cells = cells.filter((v) => v !== "");
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
  if (!best) throw new Error("Could not align Snow-Forecast day headings with Tehran date");
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
    month: "short",
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

function summarizeDay(date, cells) {
  const maxTemps = values(cells, "maxTemp");
  const chills = values(cells, "windChill");
  const winds = values(cells, "wind");
  const snow = values(cells, "snow").reduce((a, b) => a + b, 0);
  const condition = [...cells].sort(
    (a, b) => conditionRank(b.summary) - conditionRank(a.summary)
  )[0]?.summary || "";

  return {
    day: persianDay(date),
    date: persianDate(date),
    icon: conditionIcon(condition),
    temp: maxTemps.length ? Math.round(Math.max(...maxTemps)) : 0,
    feels: chills.length ? Math.round(Math.min(...chills)) : 0,
    wind: winds.length ? Math.round(Math.max(...winds)) : 0,
    snow: Math.round(snow * 10) / 10
  };
}

(async () => {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; DizinWeatherBot/1.0; +https://github.com/erfanchgh/dizin-weather-system)",
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
  const phraseCells = rowCells($, "phrases", periodCount);
  const windCells = rowCells($, "wind", periodCount);
  const snowCells = rowCells($, "snow", periodCount);
  const maxTempCells = rowCells($, "temperature-max", periodCount);
  const minTempCells = rowCells($, "temperature-min", periodCount);
  const chillCells = rowCells($, "temperature-chill", periodCount);

  const summaries = phraseCells;
  const winds = windCells.map(number);
  const snows = snowCells.map((v) => number(v) || 0);
  const maxTemps = maxTempCells.map(number);
  const minTemps = minTempCells.map(number);
  const chills = chillCells.map(number);

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
    throw new Error(`Forecast table incomplete: periods=${periods.length}, summaries=${summaries.length}, winds=${winds.length}, max=${maxTemps.length}, chill=${chills.length}`);
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
      windChill: toMetric(chills[i], "temp", isMetric)
    });
  }

  const grouped = new Map();
  for (const cell of cells) {
    const key = dateKey(cell.date);
    if (!grouped.has(key)) grouped.set(key, { date: cell.date, cells: [] });
    grouped.get(key).cells.push(cell);
  }

  const todayKey = dateKey(today);
  const days = [...grouped.values()]
    .filter((g) => dateKey(g.date) >= todayKey)
    .slice(0, 3)
    .map((g) => summarizeDay(g.date, g.cells));

  if (days.length < 3) throw new Error("Fewer than three future forecast days were parsed");

  const payload = {
    summitElevation: 3599,
    note: "پیش‌بینی قله دیزین؛ شرایط جوی کوهستان می‌تواند سریع تغییر کند.",
    source: "Snow-Forecast.com",
    sourceUrl: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    days
  };

  fs.writeFileSync(
    OUTPUT,
    `window.DIZIN_WEATHER = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8"
  );

  console.log("Updated Dizin summit forecast:", JSON.stringify(days));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
