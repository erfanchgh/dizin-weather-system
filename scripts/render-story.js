const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

(async () => {
  const outputDir = path.join(process.cwd(), "output");
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 540, height: 960 }, deviceScaleFactor: 2
    });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:8000/index.html?render=1", { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (!document.fonts.check('900 28px "Vazirmatn"'))
        throw new Error("Vazirmatn is not loaded");
      const logo = document.querySelector(".brand-logo");
      await logo.decode();
      const background = new Image();
      background.src = window.DIZIN_ASSETS.background;
      await background.decode();
      if (!logo.naturalWidth || !background.naturalWidth) throw new Error("Missing Dizin assets");
      const data = window.DIZIN_WEATHER;
      if (data.summitElevation !== 3599 || data.sourceUrl !== "https://www.snow-forecast.com/resorts/Dizin/6day/top")
        throw new Error("Wrong summit source");
      const cards = [...document.querySelectorAll(".day-card")];
      if (cards.length !== 3) throw new Error("Expected three cards");
      const positions = cards.map(c => c.getBoundingClientRect().x);
      if (!(positions[0] > positions[1] && positions[1] > positions[2]))
        throw new Error("Forecast order must be right to left");
      const header = document.querySelector(".story-header").getBoundingClientRect();
      if (logo.getBoundingClientRect().x > header.x + header.width / 2)
        throw new Error("Logo must be at top left");
      const text = document.querySelector("#story").innerText;
      if (/شمشک|Shemshak|mm|شرایط مناسب برای اسکی/i.test(text))
        throw new Error("Unexpected rain amount, resort or ski suitability claim");
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(new Date(data.updatedAt));
      const part = type => Number(parts.find(p => p.type === type).value);
      for (let i = 0; i < 3; i++) {
        const expected = new Date(Date.UTC(part("year"), part("month") - 1, part("day") + i + 1));
        if (data.days[i].isoDate !== expected.toISOString().slice(0, 10))
          throw new Error("Forecast dates must begin tomorrow in Tehran");
      }
      return true;
    });
    assert.deepEqual(errors, [], "Page JavaScript errors");
    const pngPath = path.join(outputDir, "daily-story.png");
    await page.locator("#story").screenshot({ path: pngPath, type: "png" });
    const png = fs.readFileSync(pngPath);
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1920);
    console.log("PASS: assets, font, JavaScript, RTL, summit, future dates and PNG 1080x1920.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
