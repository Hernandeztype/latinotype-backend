// server.js (V10.4)
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
  let browser;

  try {
    console.log("👉 Intentando lanzar Chromium en Render...");

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      timeout: 120000, // ⬅️ hasta 2 minutos
    });

    console.log("✅ Navegador lanzado");

    for (const url of urls) {
      console.log(`🚀 Escaneando: ${url}`);
      try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        console.log("✅ Página cargada");

        // fuentes desde DOM
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
        const hora = new Date().toLocaleTimeString("es-CL");

        const result = { url, fuentesDetectadas, latinotype, fecha, hora };
        results.push(result);

        console.log("📊 Resultado:", result);

        // enviar a Make
        try {
          await fetch("https://hook.us2.make.com/3n1u73xoebtzlposueqrmjwjb9z6nqp5", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(result),
          });
          console.log("📤 Enviado a Make:", result.url);
        } catch (err) {
          console.error("⚠️ Error enviando a Make:", err.message);
        }

        await page.close();
      } catch (err) {
        console.error(`❌ Error en ${url}:`, err.message);
        results.push({
          url,
          fuentesDetectadas: [],
          latinotype: "Error",
          fecha: new Date().toISOString().split("T")[0],
          hora: new Date().toLocaleTimeString("es-CL"),
        });
      }
    }
  } catch (err) {
    console.error("❌ No se pudo lanzar el navegador:", err.message);
    return res.status(500).json({ error: "No se pudo iniciar Chromium en Render" });
  } finally {
    if (browser) {
      await browser.close();
      console.log("🛑 Navegador cerrado");
    }
  }

  res.json({ results });
});

// iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
