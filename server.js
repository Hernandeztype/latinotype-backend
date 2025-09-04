// server.js (V10.2)
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import cors from "cors";
import fetch from "node-fetch"; // 👈 para enviar a Make
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

function cleanFontName(name) {
  return name.replace(/['"]/g, "").replace(/;/g, "").trim();
}

function processFonts(fuentesDetectadas, latinotypeFonts) {
  const clean = [...new Set(fuentesDetectadas.map(cleanFontName).filter(Boolean))];

  const latinotypeDetected = latinotypeFonts.filter((lt) =>
    clean.some((f) => f.toLowerCase().includes(lt.toLowerCase()))
  );

  return {
    fuentesDetectadas: clean,
    latinotype:
      latinotypeDetected.length > 0 ? latinotypeDetected.join(", ") : "Ninguna",
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

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
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      console.log("✅ Página cargada");

      // --- DOM fonts
      const fuentesDom = await page.evaluate(() =>
        Array.from(document.querySelectorAll("*"))
          .map((el) => window.getComputedStyle(el).getPropertyValue("font-family"))
          .filter(Boolean)
      );

      // --- CSS fonts
      const fuentesCss = await page.evaluate(() => {
        try {
          return Array.from(document.styleSheets)
            .map((sheet) => {
              try {
                return Array.from(sheet.cssRules || []);
              } catch {
                return [];
              }
            })
            .flat()
            .map((rule) => rule.style && rule.style.fontFamily)
            .filter(Boolean);
        } catch {
          return [];
        }
      });

      const allFonts = [...fuentesDom, ...fuentesCss];
      console.log("🔤 Fuentes detectadas:", allFonts);

      const { fuentesDetectadas, latinotype } = processFonts(
        allFonts,
        latinotypeFonts
      );

      const fecha = new Date().toISOString().split("T")[0];
      const hora = new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" });

      const result = {
        url,
        fuentesDetectadas,
        latinotype,
        fecha,
        hora,
      };

      results.push(result);

      // Enviar a Make
      try {
        await fetch("https://hook.us2.make.com/3n1u73xoebtzlposueqrmjwjb9z6nqp5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        });
        console.log("📤 Enviado a Make:", result);
      } catch (err) {
        console.error("❌ Error enviando a Make:", err.message);
      }

      await browser.close();
    } catch (error) {
      console.error(`❌ Error en ${url}:`, error.message);
      results.push({
        url,
        fuentesDetectadas: [],
        latinotype: "Error",
        fecha: new Date().toISOString().split("T")[0],
        hora: new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" }),
      });
    }
  }

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
