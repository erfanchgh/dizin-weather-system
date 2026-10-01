const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const outputDir = path.join(process.cwd(), "output");
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  await page.goto("http://127.0.0.1:8000/index.html?render=1", {
    waitUntil: "networkidle"
  });

  await page.waitForFunction(() => {
    const story = document.querySelector("#story");
    const logo = document.querySelector(".brand-logo");
    const bg = document.querySelector("#storyBg");
    return story && bg && logo && logo.getAttribute("src");
  }, null, { timeout: 15000 });

  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  const story = page.locator("#story");
  await story.screenshot({
    path: path.join(outputDir, "daily-story.png"),
    type: "png"
  });

  await browser.close();
  console.log("Rendered output/daily-story.png at 1080x1920.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
