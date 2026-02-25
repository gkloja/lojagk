import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";

const app = express();

// Configurações essenciais para receber dados (textos, formulários e JSON)
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// Suas URLs
const BASE = "http://br2.bronxyshost.com:4009/lojagk";
const MASK = "https://lojagk.vercel.app";

// Rota coringa que captura TUDO e repassa para o servidor original
app.all('*', async (req, res) => {
  try {
    const targetUrl = BASE + req.url;
    console.log(`🔗 Proxy: ${req.method} ${req.path}`);

    // 1. Prepara os cabeçalhos para o backend
    const headers = { 
      ...req.headers,
      "host": new URL(BASE).host,
      "origin": BASE,
      "referer": BASE + "/",
      "x-forwarded-for": req.ip
    };
    
    // Remove para evitar conflitos ao reconstruir o body
    delete headers["content-length"];

    // 2. Prepara o corpo da requisição (se houver dados sendo enviados)
    let bodyInfo = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers["content-type"] || "";
      
      if (contentType.includes("application/json")) {
        bodyInfo = JSON.stringify(req.body);
        headers["Content-Type"] = "application/json";
      } else if (contentType.includes("multipart/form-data")) {
        // Para uploads de imagem direto do formulário
        bodyInfo = req;
        delete headers["content-type"]; 
      } else {
        bodyInfo = new URLSearchParams(req.body).toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      }
    }

    // 3. Dispara para o servidor original
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: bodyInfo,
      redirect: "manual", // Essencial para o login funcionar
    });

    // 4. Trata redirecionamentos do backend (ex: após salvar um produto)
    const location = response.headers.get("location");
    if (location) {
      let redirectUrl = location;
      if (redirectUrl.startsWith("/")) {
        redirectUrl = MASK + redirectUrl;
      } else if (redirectUrl.startsWith(BASE)) {
        redirectUrl = redirectUrl.replace(BASE, MASK);
      }
      res.setHeader("Location", redirectUrl);
      return res.status(response.status).end();
    }

    // 5. Repassa os cookies (mantém a sessão do usuário logada)
    const cookies = response.headers.raw()["set-cookie"];
    if (cookies) {
      cookies.forEach(cookie => {
        res.append("Set-Cookie", cookie);
      });
    }

    const responseType = response.headers.get("content-type");
    if (responseType) res.setHeader("Content-Type", responseType);

    // 6. Envia a resposta final corrigida para o node-fetch v3
    if (responseType && responseType.includes("text/html")) {
      res.send(await response.text());
    } else {
      // Correção do erro de buffer()
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    }
    
  } catch (error) {
    console.error("❌ Erro no proxy:", error);
    res.status(500).send("Erro de comunicação com o servidor original.");
  }
});

// ====== EXPORTAÇÃO EXCLUSIVA PARA O VERCEL ======
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Máscara rodando na porta ${PORT}`));
}

export default app;
