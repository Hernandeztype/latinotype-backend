// server.js (V10.0 - Render ready con puppeteer completo)
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// limpiar nombres de fuentes
function cleanFontName(name) {
  return name.replace(/['"]/g, "").replace(/;/g, "").trim();
}

// procesar fuentes detectadas y separar Latinotype
function processFonts(fuentesDetectadas, latinotypeFonts) {
  const clean = [...new Set(fuentesDetectadas.map(cleanFontName))];

  const latinotypeDetected = latinotypeFonts.filter((lt) =>
    clean.some((f) => f.toLowerCase().includes(lt.toLowerCase()))
  );

  return {
    fuentesDetectadas: clean,
    latinotype:
      latinotypeDetected.length > 0 ? latinotypeDetected.join(", ") : "Ninguna",
  };
}

// healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// endpoint principal
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const results = [];

  for (const url of urls) {
    console.log(`🚀 Escaneando: ${url}`);
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      console.log("✅ Página cargada");

      // fuentes desde DOM
      const fuentesDom = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("*"));
        const fonts = elements.map((el) =>
          window.getComputedStyle(el).getPropertyValue("font-family")
        );
        return [...new Set(fonts)];
      });

      // fuentes desde CSS
      const fuentesCss = await page.evaluate(() => {
        const rules = Array.from(document.styleSheets)
          .map((sheet) => {
            try {
              return Array.from(sheet.cssRules || []);
            } catch {
              return [];
            }
          })
          .flat();

        const fonts = rules
          .map((rule) => rule.style && rule.style.fontFamily)
          .filter(Boolean);
        return [...new Set(fonts)];
      });

      const { fuentesDetectadas, latinotype } = processFonts(
        fuentesDom.concat(fuentesCss),
        latinotypeFonts
      );

      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toLocaleTimeString();

      results.push({
        url,
        fuentesDetectadas,
        latinotype,
        fecha,
        hora,
      });

      await browser.close();
    } catch (error) {
      console.error(`❌ Error en ${url}:`, error.message);
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

// iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
