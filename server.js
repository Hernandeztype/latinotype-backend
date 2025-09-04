// server.js (V10.1 con CORS)
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer";
import latinotypeFonts from "./data/latinotypeFonts.js";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

// Middlewares
app.use(bodyParser.json());
app.use(cors()); // 👈 Habilita CORS para todas las rutas

// limpiar nombres de fuentes
function cleanFontName(name) {
  return name.replace(/['"]/g, "").replace(/;/g, "").trim();
}

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

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint principal
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const results = [];
  for (const url of urls) {
    console.log(`🚀 Escaneando: ${url}`);
    try {
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      const fuentesDom = await page.evaluate(() =>
        Array.from(document.querySelectorAll("*")).map((el) =>
          window.getComputedStyle(el).getPropertyValue("font-family")
        )
      );

      const { fuentesDetectadas, latinotype } = processFonts(
        fuentesDom,
        latinotypeFonts
      );

      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toLocaleTimeString();

      results.push({ url, fuentesDetectadas, latinotype, fecha, hora });

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

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
