import express from "express";
import cors from "cors";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Normalizar nombres de fuentes
function normalizarFuente(nombre) {
  return nombre
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[-_]/g, " ") // guiones y underscores a espacio
    .replace(/\s+/g, " ")  // colapsar espacios
    .replace(/regular|bold|italic|semibold|thin|light|medium|extra|black|heavy/g, "")
    .trim();
}

// Escanear una URL
async function escanear(url) {
  console.log(`🚀 Escaneando: ${url}`);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  try {
    console.log("🌍 Cargando página...");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    console.log("✅ Página cargada");

    // Extraer fuentes del DOM
    const domFonts = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll("*")].map((el) => getComputedStyle(el).fontFamily))]
    );

    // Extraer fuentes de CSS
    const cssFonts = await page.evaluate(() => {
      const fonts = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.style && rule.style.fontFamily) {
              fonts.push(rule.style.fontFamily);
            }
          }
        } catch (e) {}
      }
      return fonts;
    });

    const todasLasFuentes = [...new Set([...domFonts, ...cssFonts])];
    console.log("🔤 Fuentes detectadas:", todasLasFuentes);

    // Buscar coincidencias con Latinotype
    const latinotypeDetectadas = latinotypeFonts.filter((lf) =>
      todasLasFuentes.some((f) =>
        normalizarFuente(f).includes(normalizarFuente(lf))
      )
    );

    await browser.close();

    const now = new Date();
    const resultado = {
      url,
      fuentesDetectadas: todasLasFuentes,
      latinotype: latinotypeDetectadas.length > 0 ? latinotypeDetectadas.join(", ") : "Ninguna",
      fecha: now.toISOString().split("T")[0],
      hora: now.toLocaleTimeString(),
    };

    console.log("📊 Resultado:", resultado);
    return resultado;
  } catch (err) {
    console.error(`❌ Error al escanear ${url}:`, err.message);
    await browser.close();
    return { url, error: err.message };
  }
}

// Endpoint healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint scan
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const results = [];
  for (const url of urls) {
    results.push(await escanear(url));
  }
  res.json({ results });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
