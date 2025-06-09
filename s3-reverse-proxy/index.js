const express = require("express");
const httpProxy = require("http-proxy");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT;

const BASE_PATH = process.env.BASE_PATH;

const proxy = httpProxy.createProxy();

app.use((req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split(".")[0];

  const resolvesTo = `${BASE_PATH}/${subdomain}`;

  if (req.url === "/") {
    req.url = "/index.html";
  }

  proxy.web(req, res, {
    target: resolvesTo,
    changeOrigin: true,
  });
});

app.listen(PORT, () =>
  console.log(`🔁 Reverse Proxy Running on http://localhost:${PORT}`)
);
