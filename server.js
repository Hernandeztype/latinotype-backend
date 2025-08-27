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

// 🔧 Normalizar fuentes
function normalizarFuente(nombre) {
  return nombre
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/-/g, " ")
    .trim();
}

// 🔎 Escanear una URL
async function escanear(url) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(3000); // espera extra para que carguen fuentes externas

    // 1. Extraer fuentes del DOM
    const domFonts = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll("*")].map((el) => getComputedStyle(el).fontFamily))]
    );

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
          // ignorar estilos externos sin acceso
        }
      }
      return fonts;
    });

    await browser.close();

    // 3. Combinar y limpiar
    const todasLasFuentes = [...new Set([...domFonts, ...cssFonts])]
      .map((f) => f.replace(/['"]+/g, "").trim());

    // 4. Buscar coincidencias Latinotype
    const encontrados = todasLasFuentes.filter((f) =>
      latinotypeFonts.some((lf) =>
        normalizarFuente(f).includes(normalizarFuente(lf))
      )
    );

    // 5. Payload con fecha/hora
    const now = new Date();
    const fecha = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const hora = now.toLocaleTimeString("en-GB");  // HH:mm:ss

    const resultado = {
      url,
      fuentesDetectadas: todasLasFuentes,
      latinotype: encontrados.length > 0 ? encontrados.join(", ") : "Ninguna",
      fecha,
      hora,
    };

    // 6. Enviar a Make
    try {
      const resp = await fetch("https://hook.us2.make.com/3n1u73xoebtzlposueqrmjwjb9z6nqp5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resultado),
      });
      console.log(`📤 Enviado a Make (${resp.status}):`, resultado);
    } catch (e) {
      console.error("❌ Error al enviar a Make:", e.message);
    }

    return resultado;
  } catch (err) {
    await browser.close();
    console.error(`❌ Error al escanear ${url}:`, err.message);
    return { url, error: err.message };
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
