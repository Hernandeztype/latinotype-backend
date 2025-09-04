// server.js (V10.1 optimizado)
import express from "express";
import bodyParser from "body-parser";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import cors from "cors";
import fetch from "node-fetch";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

// ✅ Limpiar nombres de fuentes
function cleanFontName(name) {
  return name.replace(/['"]/g, "").replace(/;/g, "").trim();
}

// ✅ Procesar fuentes y detectar Latinotype
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

// ✅ Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ✅ Endpoint principal
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const results = [];

  for (const url of urls) {
    console.log(`🚀 Escaneando: ${url}`);
    let browser = null;

    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();

      // ⚡️ Bloquear imágenes, videos y fuentes externas pesadas
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        if (["image", "media", "stylesheet", "font"].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // ⏳ Timeout balanceado
      await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

      console.log("✅ Página cargada");

      // 🔍 Detectar fuentes
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
      const hora = new Date().toLocaleTimeString("es-CL", {
        timeZone: "America/Santiago",
      });

      results.push({ url, fuentesDetectadas, latinotype, fecha, hora });

      // 📤 Enviar a Make
      try {
        await fetch("https://hook.us2.make.com/3n1u73xoebtzlposueqrmjwjb9z6nqp5", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha,
            hora,
            url,
            fuentesDetectadas: fuentesDetectadas.join(", "),
            latinotype,
          }),
        });
        console.log(`📤 Enviado a Make: ${url}`);
      } catch (err) {
        console.error("⚠️ Error enviando a Make:", err.message);
      }
    } catch (error) {
      console.error(`❌ Error en ${url}:`, error.message);
      results.push({
        url,
        fuentesDetectadas: [],
        latinotype: "Error",
        fecha: new Date().toISOString().split("T")[0],
        hora: new Date().toLocaleTimeString("es-CL", {
          timeZone: "America/Santiago",
        }),
      });
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  res.json({ results });
});

// ✅ Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
