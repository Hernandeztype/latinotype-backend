import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 10000;

// ✅ Middleware
app.use(express.json());
app.use(
  cors({
    origin: "*", // permite desde cualquier frontend
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// ✅ Ruta raíz para evitar el 404 de Render
app.get("/", (req, res) => {
  res.send("🚀 Latinotype Scanner Backend corriendo");
});

// ✅ Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "OK 🚀" });
});

// ✅ Endpoint de escaneo
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Falta 'urls' en el body" });
  }

  const results = [];
  for (const url of urls) {
    console.log(`🚀 Escaneando: ${url}`);
    try {
      const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // 🔤 Detectar fuentes
      const fuentes = await page.evaluate(() => {
        const elements = [...document.querySelectorAll("*")];
        const fonts = new Set();
        elements.forEach((el) => {
          const style = window.getComputedStyle(el).getPropertyValue("font-family");
          if (style) fonts.add(style);
        });
        return Array.from(fonts);
      });

      await browser.close();

      // 📊 Revisar si alguna fuente es Latinotype
      const latinotypeMatch = fuentes.find((f) =>
        latinotypeFonts.some((lt) => f.toLowerCase().includes(lt.toLowerCase()))
      );

      results.push({
        url,
        fuentesDetectadas: fuentes,
        latinotype: latinotypeMatch || "Ninguna",
        fecha: new Date().toISOString().split("T")[0],
        hora: new Date().toLocaleTimeString(),
      });
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

// ✅ Arranque del servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
