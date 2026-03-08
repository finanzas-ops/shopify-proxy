const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Seguridad: solo permite el origen de tu dashboard
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', ALLOWED_ORIGINS);
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Endpoint principal: carritos abandonados
app.get('/checkouts', async (req, res) => {
  try {
    if (!SHOPIFY_TOKEN || !SHOPIFY_DOMAIN) {
      return res.status(500).json({ error: 'Faltan variables de entorno SHOPIFY_TOKEN y SHOPIFY_DOMAIN' });
    }

    // Parámetros de fecha desde el dashboard
    const params = new URLSearchParams();
    params.set('status', 'open');
    params.set('limit', '250');
    if (req.query.created_at_min) params.set('created_at_min', req.query.created_at_min);
    if (req.query.created_at_max) params.set('created_at_max', req.query.created_at_max);

    const url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/checkouts.json?${params}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Shopify Proxy activo ✅' });
});

app.listen(PORT, () => {
  console.log(`Proxy corriendo en puerto ${PORT}`);
});
