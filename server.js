import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("🚀 Backend de Latinotype Scanner funcionando");
});

// 🔹 Endpoint de healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint para escaneo (ejemplo)
app.post("/scan", (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Debes enviar un array de URLs" });
  }

  // Simulación de respuesta
  const results = urls.map((url) => ({
    url,
    fuentesDetectadas: ["Arial", "Times New Roman"],
    latinotype: "Recoleta",
    fecha: new Date().toISOString().split("T")[0],
    hora: new Date().toLocaleTimeString(),
  }));

  res.json({ results });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en puerto ${PORT}`);
});
