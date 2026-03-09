const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGINS);
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/auth', (req, res) => {
  const redirectUri = `https://${req.headers.host}/callback`;
  const scopes = 'read_checkouts,read_customers,read_orders';
  const authUrl = `https://${SHOPIFY_DOMAIN}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${redirectUri}`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const { code, shop } = req.query;
  if (!code) return res.status(400).json({ error: 'No code recibido' });
  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code })
    });
    const data = await response.json();
    if (data.access_token) {
      res.send(`<html><head><style>body{font-family:monospace;background:#0a0a0f;color:#e8e8f4;padding:40px;max-width:600px;margin:0 auto}h2{color:#5bf4c2}.token{background:#1a1a26;border:1px solid #5b5ef4;border-radius:8px;padding:16px;font-size:14px;word-break:break-all;color:#5b5ef4;margin:16px 0}p{color:#8888aa;line-height:1.6}</style></head><body><h2>✅ Token obtenido</h2><p>Copia este token y ponlo en Railway como <strong>SHOPIFY_TOKEN</strong>:</p><div class="token">${data.access_token}</div><p>1. Copia el token<br>2. Railway → Variables → edita SHOPIFY_TOKEN<br>3. Pega y guarda<br>4. ¡Listo!</p></body></html>`);
    } else {
      res.status(400).json({ error: 'No se pudo obtener token', details: data });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trae TODOS los carritos paginando automáticamente
app.get('/checkouts', async (req, res) => {
  try {
    if (!SHOPIFY_TOKEN || !SHOPIFY_DOMAIN) {
      return res.status(500).json({ error: 'Faltan variables de entorno SHOPIFY_TOKEN y SHOPIFY_DOMAIN' });
    }

    let allCheckouts = [];
    let url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/checkouts.json?status=open&limit=250&order=created_at+desc`;
    if (req.query.created_at_min) url += `&created_at_min=${req.query.created_at_min}`;
    if (req.query.created_at_max) url += `&created_at_max=${req.query.created_at_max}`;

    // Paginación automática — trae todas las páginas
    while (url) {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: text });
      }

      const data = await response.json();
      allCheckouts = allCheckouts.concat(data.checkouts || []);

      // Verificar si hay siguiente página via Link header
      const linkHeader = response.headers.get('link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = nextMatch ? nextMatch[1] : null;

      // Límite de seguridad: máximo 2000 carritos
      if (allCheckouts.length >= 2000) break;
    }

    res.json({ checkouts: allCheckouts, total: allCheckouts.length });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Shopify Proxy activo ✅' });
});

app.listen(PORT, () => console.log(`Proxy corriendo en puerto ${PORT}`));
