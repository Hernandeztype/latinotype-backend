// backend/server.js
import express from "express";
import cors from "cors";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint /scan
app.post("/scan", async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const fecha = new Date().toISOString().split("T")[0];
  const hora = new Date().toLocaleTimeString();

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

      // ⏳ Esperamos hasta 30s y a que la red quede "tranquila"
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      console.log("✅ Página cargada");

      // Extraer fuentes desde el DOM y CSS
      const fuentes = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("*"));
        const fonts = elements.map((el) => getComputedStyle(el).fontFamily);
        return [...new Set(fonts)];
      });

      console.log("🔤 Fuentes detectadas:", fuentes);

      await browser.close();

      // Comparar con fuentes de Latinotype
      const latinotypeDetectadas = fuentes.filter((f) =>
        latinotypeFonts.some((lt) =>
          f.toLowerCase().includes(lt.toLowerCase())
        )
      );

      results.push({
        url,
        fuentesDetectadas: fuentes,
        latinotype: latinotypeDetectadas.length
          ? latinotypeDetectadas.join(", ")
          : "Ninguna",
        fecha,
        hora,
      });
    } catch (error) {
      console.error(`❌ Error en ${url}:`, error.message);
      results.push({
        url,
        fuentesDetectadas: [],
        latinotype: "Error",
        fecha,
        hora,
      });
    }
  }

  res.json({ results });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
