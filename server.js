import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🔧 Normalizar fuentes
function normalizarFuente(nombre) {
  return nombre
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/regular|bold|italic|semibold|thin|light|medium/g, "")
    .trim();
}

// 🔎 Escanear una URL con timeout
async function escanear(url) {
  console.log(`\n🚀 Escaneando: ${url}`);
  let browser;
  const inicio = Date.now();

  try {
    // Timeout global → aborta después de 20s
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("⏳ Timeout global alcanzado")), 20000)
    );

    const resultado = await Promise.race([
      (async () => {
        browser = await puppeteer.launch({
          args: [
            ...chromium.args,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--single-process",
          ],
          defaultViewport: chromium.defaultViewport,
          executablePath: process.env.CHROME_PATH || (await chromium.executablePath()),
          headless: chromium.headless,
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

        // Solo analizamos hasta 200 nodos → más liviano
        const domFonts = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll("*")].slice(0, 200);
          return [...new Set(nodes.map(el => getComputedStyle(el).fontFamily))];
        });

        await browser.close();

        const todasLasFuentes = [...new Set(domFonts)]
          .map(f => f.replace(/['"]+/g, "").trim())
          .filter(f => f && !f.includes("inherit") && !f.includes("sans-serif"));

        const encontrados = todasLasFuentes.filter(f =>
          latinotypeFonts.some(lf =>
            normalizarFuente(f).includes(normalizarFuente(lf))
          )
        );

        const now = new Date();
        return {
          url,
          fuentesDetectadas: todasLasFuentes,
          latinotype: encontrados.length > 0 ? encontrados.join(", ") : "Ninguna",
          fecha: now.toISOString().split("T")[0],
          hora: now.toLocaleTimeString("en-GB"),
        };
      })(),
      timeoutPromise,
    ]);

    console.log(
      `📊 Resultado (${((Date.now() - inicio) / 1000).toFixed(1)}s):`,
      resultado
    );
    return resultado;
  } catch (err) {
    if (browser) await browser.close();
    console.error(`❌ Error en ${url}:`, err.message);
    return {
      url,
      error: err.message,
      fuentesDetectadas: [],
      latinotype: "Error",
      fecha: new Date().toISOString().split("T")[0],
      hora: new Date().toLocaleTimeString("en-GB"),
    };
  }
}

// 📌 Endpoints
app.post("/scan", async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  const resultados = [];
  for (const url of urls) {
    resultados.push(await escanear(url));
  }
  res.json({ results: resultados });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
