import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";

const app = express();

app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// Separamos em duas variáveis: O servidor puro e a pasta da loja
const ROOT_SERVER = "http://br2.bronxyshost.com:4009";
const BASE = "http://br2.bronxyshost.com:4009/lojagk";
const MASK = "https://lojagk.vercel.app";

app.all('*', async (req, res) => {
  try {
    // 1. O DESVIO INTELIGENTE
    // Verifica se a requisição termina com extensão de arquivo de imagem, css, script, etc.
    const isFile = /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js)$/i.test(req.path);
    
    // Se for arquivo, pega do servidor puro (ROOT_SERVER). Se for página, pega da loja (BASE)
    const targetUrl = isFile ? ROOT_SERVER + req.url : BASE + req.url;
    
    console.log(`🔗 Proxy [${isFile ? 'ARQUIVO' : 'PÁGINA'}]: ${req.method} ${req.path} ---> ${targetUrl}`);

    const headers = { 
      ...req.headers,
      "host": new URL(ROOT_SERVER).host,
      "origin": ROOT_SERVER,
      "referer": ROOT_SERVER + "/",
      "x-forwarded-for": req.ip
    };
    delete headers["content-length"];

    let bodyInfo = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        bodyInfo = JSON.stringify(req.body);
        headers["Content-Type"] = "application/json";
      } else if (contentType.includes("multipart/form-data")) {
        bodyInfo = req;
        delete headers["content-type"]; 
      } else {
        bodyInfo = new URLSearchParams(req.body).toString();
        headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      }
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: bodyInfo,
      redirect: "manual",
    });

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

    const cookies = response.headers.raw()["set-cookie"];
    if (cookies) {
      cookies.forEach(cookie => {
        res.append("Set-Cookie", cookie);
      });
    }

    const responseType = response.headers.get("content-type") || "";
    if (responseType) res.setHeader("Content-Type", responseType);

    if (responseType.includes("text/") || responseType.includes("application/json") || responseType.includes("application/javascript")) {
      let textContent = await response.text();
      
      // Apenas trocamos os links absolutos que o backend enviar de volta, para manter tudo no Vercel
      textContent = textContent.replace(/http:\/\/br2\.bronxyshost\.com:4009\/lojagk/g, MASK);
      textContent = textContent.replace(/http:\/\/br2\.bronxyshost\.com:4009/g, MASK);

      res.send(textContent);
    } else {
      // Aqui as imagens passam em formato binário diretamente pro navegador!
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    }
    
  } catch (error) {
    console.error("❌ Erro no proxy:", error);
    res.status(500).send("Erro de comunicação com o servidor original.");
  }
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 Máscara rodando na porta ${PORT}`));
}

export default app;


    
