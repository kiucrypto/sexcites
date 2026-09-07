const express = require("express");
const path = require("path");

const app = express();

// Puerto de Render
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos públicos
app.use(express.static(path.join(__dirname, "public")));

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API de prueba
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    site: "SEXCITES.COM",
    status: "online",
    message: "Servidor funcionando correctamente"
  });
});

// API para comprobar el servidor
app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    server: "SEXCITES.COM",
    timestamp: new Date().toISOString()
  });
});

// Ruta para cualquier página que todavía no exista
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SEXCITES.COM</title>
      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #080808;
          color: white;
          font-family: Arial, sans-serif;
          text-align: center;
        }

        .box {
          width: 90%;
          max-width: 500px;
          padding: 40px 25px;
          border: 1px solid #292929;
          border-radius: 20px;
          background: #111;
          box-shadow: 0 0 40px rgba(255, 0, 70, 0.12);
        }

        h1 {
          margin: 0 0 12px;
          font-size: 42px;
          letter-spacing: -2px;
        }

        h1 span {
          color: #ff174f;
        }

        p {
          color: #aaa;
          line-height: 1.6;
        }

        a {
          display: inline-block;
          margin-top: 15px;
          padding: 13px 22px;
          border-radius: 10px;
          background: #ff174f;
          color: white;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <h1>SEX<span>CITES</span></h1>
        <p>La página que buscas todavía no existe.</p>
        <a href="/">Volver al inicio</a>
      </div>
    </body>
    </html>
  `);
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log("SEXCITES.COM");
  console.log("Servidor iniciado correctamente");
  console.log(`Puerto: ${PORT}`);
  console.log("=================================");
});
