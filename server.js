import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🔧 Normalizar nombres de fuentes
function normalizarFuente(nombre) {
  return nombre
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/-/g, " ")
    .trim();
}

// 🔎 Escanear una URL
async function escanear(url) {
  console.log(`\n🚀 Iniciando escaneo de: ${url}`);

  let browser;
  try {
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
    console.log("✅ Navegador lanzado");

    const page = await browser.newPage();

    // 👤 User-Agent real
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0 Safari/537.36"
    );

    console.log("🌍 Cargando página...");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 120000 });

    // ⏳ Espera extra de 5s (compatibilidad con versiones viejas)
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("✅ Página cargada");

    // 1. Extraer fuentes del DOM
    const domFonts = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll("*")].map(
        (el) => getComputedStyle(el).fontFamily
      ))]
    );
    console.log("🔤 Fuentes DOM detectadas:", domFonts);

    // 2. Extraer fuentes de CSS
    const cssFonts = await page.evaluate(() => {
      const fonts = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.style && rule.style.fontFamily) {
              fonts.push(rule.style.fontFamily);
            }
          }
        } catch (e) {
          // ignorar errores CORS
        }
      }
      return fonts;
    });
    console.log("📄 Fuentes CSS detectadas:", cssFonts);

    await browser.close();
    console.log("✅ Navegador cerrado");

    // 3. Combinar y limpiar
    const todasLasFuentes = [...new Set([...domFonts, ...cssFonts])]
      .map((f) => f.replace(/['"]+/g, "").trim());

    // 4. Buscar coincidencias con Latinotype
    const encontrados = todasLasFuentes.filter((f) =>
      latinotypeFonts.some((lf) =>
        normalizarFuente(f).includes(normalizarFuente(lf))
      )
    );

    const now = new Date();
    const resultado = {
      url,
      fuentesDetectadas: todasLasFuentes,
      latinotype: encontrados.length > 0 ? encontrados.join(", ") : "Ninguna",
      fecha: now.toISOString().split("T")[0],
      hora: now.toLocaleTimeString("en-GB"),
    };

    console.log("📊 Resultado final:", resultado);

    // 5. Enviar a Make
    try {
      const resp = await fetch("https://hook.us2.make.com/3n1u73xoebtzlposueqrmjwjb9z6nqp5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resultado),
      });
      console.log(`📤 Enviado a Make (${resp.status})`);
    } catch (e) {
      console.error("❌ Error al enviar a Make:", e.message);
    }

    return resultado;
  } catch (err) {
    console.error(`❌ Error al escanear ${url}:`, err.message);
    if (browser) await browser.close();

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

// ✅ Endpoints
app.get("/", (req, res) => {
  res.send("🚀 Backend de Latinotype Scanner funcionando");
});

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
    results.push(await escanear(url));
  }

  res.json({ results });
});

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
