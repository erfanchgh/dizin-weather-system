const fs = require("fs");
const path = require("path");
const SnowRequest = require("snow-forecast-sfr").default;

const snow = SnowRequest();
const OUTPUT = path.join(process.cwd(), "data.js");

function getForecast() {
  return new Promise((resolve, reject) => {
    snow.parseResort(
      "Dizin",
      "top",
      (result) => {
        if (!result || result.error) {
          reject(new Error(result?.message || "Unable to read Snow-Forecast data"));
          return;
        }
        resolve(result);
      },
      { inMetric: true }
    );
  });
}

function ymdFromDate(date) {
  return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

function todayInTehranYmd() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return get("year") * 10000 + get("month") * 100 + get("day");
}

function parseForecastDate(value) {
  const d = new Date(`${value} 12:00:00 GMT`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function persianDay(date) {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    weekday: "long"
  }).format(date);
}

function persianDate(date) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone: "Asia/Tehran",
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

function finiteValues(cells, key) {
  return cells.map((c) => Number(c[key])).filter(Number.isFinite);
}

function summarizeDay(dateText, cells) {
  const date = parseForecastDate(dateText);
  const maxTemps = finiteValues(cells, "maxTemp");
  const chills = finiteValues(cells, "windChill");
  const winds = finiteValues(cells, "wind");
  const snow = finiteValues(cells, "snow").reduce((a, b) => a + b, 0);
  const condition = [...cells].sort(
    (a, b) => conditionRank(b.summary) - conditionRank(a.summary)
  )[0]?.summary || "";

  return {
    day: persianDay(date),
    date: persianDate(date),
    icon: conditionIcon(condition),
    temp: maxTemps.length ? Math.max(...maxTemps) : 0,
    feels: chills.length ? Math.min(...chills) : 0,
    wind: winds.length ? Math.max(...winds) : 0,
    snow: Math.round(snow * 10) / 10
  };
}

(async () => {
  const result = await getForecast();
  const groups = new Map();

  for (const cell of result.forecast || []) {
    if (!cell?.date) continue;
    const d = parseForecastDate(cell.date);
    if (!d) continue;
    const key = cell.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }

  const today = todayInTehranYmd();
  let available = [...groups.entries()].filter(([dateText]) => {
    const d = parseForecastDate(dateText);
    return d && ymdFromDate(d) >= today;
  });

  if (available.length < 3) {
    available = [...groups.entries()];
  }

  const days = available.slice(0, 3).map(([dateText, cells]) =>
    summarizeDay(dateText, cells)
  );

  if (days.length < 3) {
    throw new Error("Snow-Forecast returned fewer than three forecast days");
  }

  const payload = {
    summitElevation: 3599,
    note: "پیش‌بینی قله دیزین؛ شرایط جوی کوهستان می‌تواند سریع تغییر کند.",
    source: "Snow-Forecast.com",
    sourceUrl: "https://www.snow-forecast.com/resorts/Dizin/6day/top",
    issued: result.issuedDate || "",
    updatedAt: new Date().toISOString(),
    days
  };

  fs.writeFileSync(
    OUTPUT,
    `window.DIZIN_WEATHER = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8"
  );

  console.log("Updated Dizin summit forecast:", days);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
