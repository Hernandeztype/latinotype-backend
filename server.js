import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import latinotypeFonts from "./data/latinotypeFonts.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 🔧 Normalizar nombres de fuentes
function normalizarFuente(nombre) {
  return nombre
    .toLowerCase()
    .replace(/['"]/g, "")          // quitar comillas
    .replace(/[-_]/g, " ")         // guiones y underscores → espacio
    .replace(/\s+/g, " ")          // espacios múltiples → uno solo
    .replace(/regular|bold|italic|semibold|thin|light|medium/g, "") // quitar estilos comunes
    .trim();
}

// 🔎 Escanear una URL
async function escanear(url) {
  console.log(`\n🚀 Iniciando escaneo de: ${url}`);
  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: process.env.CHROME_PATH || (await chromium.executablePath()),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    console.log("🌍 Cargando página...");
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));
    console.log("✅ Página cargada");

    // 1. DOM fonts
    const domFonts = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll("*")].map(
        (el) => getComputedStyle(el).fontFamily
      ))]
    );

    // 2. CSS fonts
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

    await browser.close();

    // 3. Combinar + limpiar
    const todasLasFuentes = [...new Set([...domFonts, ...cssFonts])]
      .map((f) => f.replace(/['"]+/g, "").trim())
      .filter((f) =>
        f &&
        !f.includes("inherit") &&
        !f.includes("sans-serif") &&
        !f.includes("object-fit")
      );

    console.log("🔤 Fuentes finales:", todasLasFuentes);

    // 4. Comparar con Latinotype
    let encontrados = [];
    try {
      encontrados = todasLasFuentes.filter((f) =>
        latinotypeFonts.some((lf) =>
          normalizarFuente(f).includes(normalizarFuente(lf))
        )
      );
    } catch (err) {
      console.error("❌ Error en comparación:", err.message);
    }

    const now = new Date();
    const resultado = {
      url,
      fuentesDetectadas: todasLasFuentes,
      latinotype: encontrados.length > 0 ? encontrados.join(", ") : "Ninguna",
      fecha: now.toISOString().split("T")[0],
      hora: now.toLocaleTimeString("en-GB"),
    };

    console.log("📊 Resultado final:", resultado);
    return resultado;
  } catch (err) {
    if (browser) await browser.close();
    console.error(`❌ Error al escanear ${url}:`, err.message);

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

// 📌 Endpoint principal
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

// ✅ Endpoint de healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// 🚀 Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
