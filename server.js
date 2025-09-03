// backend/server.js
import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Utilidad: sanitizar y normalizar nombres de fuentes
function cleanFontName(font) {
  return font
    .replace(/["']/g, "")
    .replace(/[,;]/g, " ")
    .trim()
    .toLowerCase();
}

// Endpoint de escaneo
app.post("/scan", async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const results = [];

  for (const url of urls) {
    console.log(`🚀 Escaneando: ${url}`);

    let browser;
    const start = Date.now();

    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();

      // Timeout global: 20s
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("⏰ Timeout global")), 20000)
      );

      const task = (async () => {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        console.log("🌍 Página cargada");

        // Detectar fuentes en el DOM
        const domFonts = await page.evaluate(() => {
          const fonts = new Set();
          document.querySelectorAll("*").forEach((el) => {
            const style = window.getComputedStyle(el).fontFamily;
            if (style) fonts.add(style);
          });
          return Array.from(fonts).slice(0, 200); // límite de 200
        });

        // Detectar fuentes en CSS
        const cssFonts = await page.evaluate(() => {
          const fonts = new Set();
          for (let sheet of document.styleSheets) {
            try {
              for (let rule of sheet.cssRules) {
                if (rule.style && rule.style.fontFamily) {
                  fonts.add(rule.style.fontFamily);
                }
              }
            } catch (e) {
              // reglas de otros dominios bloqueadas por CORS
            }
          }
          return Array.from(fonts).slice(0, 200); // límite de 200
        });

        const allFonts = [...new Set([...domFonts, ...cssFonts])];
        console.log("🔤 Fuentes detectadas:", allFonts);

        // Normalizar y detectar Latinotype
        const normalized = allFonts.map(cleanFontName);
        const latinotypeDetected = latinotypeFonts.filter((font) =>
          normalized.some((f) => f.includes(font.toLowerCase()))
        );

        return {
          url,
          fuentesDetectadas: allFonts,
          latinotype: latinotypeDetected.length ? latinotypeDetected.join(", ") : "Ninguna",
          fecha: new Date().toISOString().split("T")[0],
          hora: new Date().toLocaleTimeString(),
        };
      })();

      const result = await Promise.race([task, timeout]);
      results.push(result);

      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`📊 Resultado (${duration}s):`, result);

    } catch (err) {
      console.error(`❌ Error en ${url}:`, err.message);
      results.push({
        url,
        fuentesDetectadas: [],
        latinotype: "Error",
        fecha: new Date().toISOString().split("T")[0],
        hora: new Date().toLocaleTimeString(),
        error: err.message,
      });
    } finally {
      if (browser) await browser.close();
    }
  }

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
