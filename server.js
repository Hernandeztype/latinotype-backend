// server.js (V9.5 con fallback robusto de Chrome/Chromium)
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import latinotypeFonts from "./data/latinotypeFonts.js";
import cors from "cors";
import fs from "fs";

const app = express();
app.use(bodyParser.json());

// ✅ Configuración de CORS
app.use(
  cors({
    origin: [
      "https://latinotype-frontend.onrender.com", // frontend en Render
      "http://localhost:5173", // pruebas locales
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

const PORT = process.env.PORT || 10000;

// 🔹 limpiar nombres de fuentes
function cleanFontName(name) {
  return name.replace(/['"]/g, "").replace(/;/g, "").trim();
}

// 🔹 procesar fuentes detectadas y separar Latinotype
function processFonts(fuentesDetectadas, latinotypeFonts) {
  const clean = [...new Set(fuentesDetectadas.map(cleanFontName))];

  const latinotypeDetected = latinotypeFonts.filter((lt) =>
    clean.some((f) => f.toLowerCase().includes(lt.toLowerCase()))
  );

  return {
    fuentesDetectadas: clean,
    latinotype:
      latinotypeDetected.length > 0
        ? latinotypeDetected.join(", ")
        : "Ninguna",
  };
}

// 🔹 healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🔹 resolver ruta de Chrome/Chromium en Render
async function getExecutablePath() {
  const paths = [
    await chromium.executablePath, // preferido por @sparticuz/chromium
    "/usr/bin/google-chrome-stable", // Render suele usar esta
    "/usr/bin/chromium-browser", // fallback
  ];

  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      console.log(`✅ Usando navegador en: ${p}`);
      return p;
    }
  }

  throw new Error("❌ No se encontró un navegador válido en Render");
}

// 🔹 endpoint principal
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
        args: chromium.args,
        executablePath: await getExecutablePath(),
        headless: chromium.headless,
        defaultViewport: chromium.defaultViewport,
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
