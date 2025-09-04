// backend/server.js
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// 🔤 Normalizador de nombres de fuentes
function normalizeFontName(name) {
  return name
    .toLowerCase()
    .replace(/["']/g, "")         // quitar comillas
    .replace(/-/g, " ")           // guiones a espacios
    .replace(/\s+/g, " ")         // espacios múltiples → uno
    .trim();
}

// 🔎 Matcher inteligente
function detectLatinotypeFonts(fuentesDetectadas) {
  const normalizedFonts = fuentesDetectadas.map(normalizeFontName);

  const matched = latinotypeFonts.filter((latinFont) => {
    const latinNorm = normalizeFontName(latinFont);
    return normalizedFonts.some((f) => f.includes(latinNorm));
  });

  return matched.length > 0 ? matched.join(", ") : "Ninguna";
}

// 🚑 Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🚀 Escaneo
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Se requiere un array de URLs" });
  }

  const results = [];

  for (const url of urls) {
    console.log(`🚀 Escaneando: ${url}`);
    try {
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // 🖼 Extraer fuentes del DOM + CSS
      const fuentesDetectadas = await page.evaluate(() => {
        const fuentes = new Set();

        // DOM
        document.querySelectorAll("*").forEach((el) => {
          const style = window.getComputedStyle(el).fontFamily;
          if (style) fuentes.add(style);
        });

        // CSS Stylesheets
        for (const sheet of document.styleSheets) {
          try {
            for (const rule of sheet.cssRules) {
              if (rule.style && rule.style.fontFamily) {
                fuentes.add(rule.style.fontFamily);
              }
            }
          } catch (e) {
            continue; // cross-origin
          }
        }

        return Array.from(fuentes);
      });

      console.log("🔤 Fuentes detectadas:", fuentesDetectadas);

      const latinotype = detectLatinotypeFonts(fuentesDetectadas);

      const now = new Date();
      results.push({
        url,
        fuentesDetectadas,
        latinotype,
        fecha: now.toISOString().split("T")[0],
        hora: now.toLocaleTimeString(),
      });

      await browser.close();
    } catch (err) {
      console.error(`❌ Error en ${url}:`, err.message);
      results.push({
        url,
        fuentesDetectadas: [],
        latinotype: "Error",
        fecha: new Date().toISOString().split("T")[0],
        hora: new Date().toLocaleTimeString(),
      });
    }
  }

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
