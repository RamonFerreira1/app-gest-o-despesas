export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { refreshToken } = req.body || {};

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token é obrigatório.' });
    }

    const clientId = process.env.EXPO_PUBLIC_MP_CLIENT_ID || process.env.MP_CLIENT_ID;
    const clientSecret = process.env.MP_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        error: 'Credenciais do Mercado Pago não configuradas no servidor.'
      });
    }

    const payload = {
      client_secret: clientSecret,
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    };

    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(payload).toString()
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro na renovação de token Mercado Pago:', data);
      return res.status(response.status).json({
        error: data.message || data.error_description || 'Erro ao renovar token no Mercado Pago.',
        details: data
      });
    }

    return res.status(200).json({
      access_token: data.access_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      scope: data.scope,
      user_id: data.user_id,
      refresh_token: data.refresh_token,
      public_key: data.public_key,
      live_mode: data.live_mode
    });

  } catch (error) {
    console.error('Exceção ao renovar token Mercado Pago:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor.' });
  }
}
