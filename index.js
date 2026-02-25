      import express from "express";
import fetch from "node-fetch";
import cookieParser from "cookie-parser";

const app = express();

app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

const BASE = "http://br2.bronxyshost.com:4009/lojagk";
const MASK = "https://lojagk.vercel.app";

// Rota para capturar arquivos da raiz (como imagens)
app.get('/:file', async (req, res, next) => {
    // Se não tiver extensão (ponto), passa pro proxy geral
    if (!req.params.file.includes('.')) {
        return next();
    }

    try {
        // Tenta buscar o arquivo na raiz do servidor original
        const fileUrl = `http://br2.bronxyshost.com:4009/${req.params.file}`;
        const response = await fetch(fileUrl, {
            headers: { "origin": BASE, "referer": BASE + "/" }
        });

        if (response.ok) {
            const type = response.headers.get("content-type") || "";
            res.setHeader("Content-Type", type);
            const arrayBuffer = await response.arrayBuffer();
            return res.send(Buffer.from(arrayBuffer));
        }
    } catch (e) {
        console.error("Erro ao buscar arquivo estático", e);
    }
    next();
});

app.all('*', async (req, res) => {
  try {
    const targetUrl = BASE + req.url;
    console.log(`🔗 Proxy: ${req.method} ${req.path}`);

    const headers = { 
      ...req.headers,
      "host": new URL(BASE).host,
      "origin": BASE,
      "referer": BASE + "/",
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
      
      // 1. Troca URLs absolutas inseguras
      textContent = textContent.replace(/http:\/\/br2\.bronxyshost\.com:4009\/lojagk/g, MASK);
      textContent = textContent.replace(/http:\/\/br2\.bronxyshost\.com:4009/g, MASK);
      
      // 2. 🔥 A MÁGICA: Corrige caminhos relativos em tags de imagem, links e scripts
      textContent = textContent.replace(/src="\//g, `src="${MASK}/`);
      textContent = textContent.replace(/href="\//g, `href="${MASK}/`);
      
      // 3. Adiciona a tag <base> para forçar links relativos a usarem a máscara
      if(textContent.includes('<head>')) {
          textContent = textContent.replace('<head>', `<head>\n<base href="${MASK}/">`);
      }

      res.send(textContent);
    } else {
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
       
