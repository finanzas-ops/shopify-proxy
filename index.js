const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

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

// Endpoint usando GraphQL Admin API (compatible con shpss_)
app.get('/checkouts', async (req, res) => {
  try {
    if (!SHOPIFY_TOKEN || !SHOPIFY_DOMAIN) {
      return res.status(500).json({ error: 'Faltan variables de entorno SHOPIFY_TOKEN y SHOPIFY_DOMAIN' });
    }

    const fromDate = req.query.created_at_min || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const toDate = req.query.created_at_max || new Date().toISOString();

    // Usamos GraphQL que sí acepta el token shpss_
    const query = `{
      abandonedCheckouts(first: 250, query: "created_at:>=${fromDate.split('T')[0]} created_at:<=${toDate.split('T')[0]}") {
        edges {
          node {
            id
            token
            email
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            billingAddress { firstName lastName phone }
            shippingAddress { firstName lastName phone }
            lineItems(first: 20) {
              edges {
                node {
                  title
                  quantity
                  originalUnitPriceSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
    }`;

    const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();

    if (data.errors) {
      // Si falla GraphQL, intentamos con REST como fallback
      return fetchREST(req, res);
    }

    // Transformar respuesta GraphQL al formato que espera el dashboard
    const checkouts = (data.data?.abandonedCheckouts?.edges || []).map(({ node: c }) => {
      const billing = c.billingAddress || c.shippingAddress || {};
      const phone = billing.phone || '';
      const name = `${billing.firstName || ''} ${billing.lastName || ''}`.trim();
      return {
        token: c.token || c.id,
        id: c.token || c.id,
        email: c.email || '',
        total_price: c.totalPriceSet?.shopMoney?.amount || '0',
        created_at: c.createdAt,
        billing_address: { first_name: billing.firstName, last_name: billing.lastName, phone },
        line_items: (c.lineItems?.edges || []).map(({ node: p }) => ({
          title: p.title,
          quantity: p.quantity,
          price: p.originalUnitPriceSet?.shopMoney?.amount || '0'
        }))
      };
    });

    res.json({ checkouts });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback REST
async function fetchREST(req, res) {
  const params = new URLSearchParams();
  params.set('status', 'open');
  params.set('limit', '250');
  if (req.query.created_at_min) params.set('created_at_min', req.query.created_at_min);
  if (req.query.created_at_max) params.set('created_at_max', req.query.created_at_max);

  const response = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-01/checkouts.json?${params}`, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  const data = await response.json();
  res.json(data);
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Shopify Proxy activo ✅' });
});

app.listen(PORT, () => {
  console.log(`Proxy corriendo en puerto ${PORT}`);
});
