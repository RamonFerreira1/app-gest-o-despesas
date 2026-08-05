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
    const secretId = process.env.BELVO_SECRET_ID || process.env.EXPO_PUBLIC_BELVO_SECRET_ID || '7164bf57-4e00-4bfc-a176-e7477f650eb6';
    const secretPassword = process.env.BELVO_SECRET_PASSWORD || '7jyZcw_mkp9mIskN1J@ndP0Vlffa3_rTfPZkD*gX7Z2XZS6G*9Fa#E#1W7znfh0r';
    const environment = process.env.BELVO_ENV || 'sandbox';

    if (!secretId || !secretPassword) {
      return res.status(500).json({
        error: 'Credenciais Belvo não configuradas no servidor (BELVO_SECRET_ID ou BELVO_SECRET_PASSWORD ausentes).'
      });
    }

    const baseUrl = environment === 'production'
      ? 'https://api.belvo.com'
      : 'https://sandbox.belvo.com';

    // Basic Auth com Secret ID e Secret Password
    const credentials = Buffer.from(`${secretId}:${secretPassword}`).toString('base64');

    const response = await fetch(`${baseUrl}/api/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`
      },
      body: JSON.stringify({
        id: secretId,
        password: secretPassword,
        scopes: 'read_institutions,write_links,read_links'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro ao gerar Belvo Widget Token:', data);
      return res.status(response.status).json({
        error: data.detail || data.message || 'Erro ao comunicar com a API do Belvo.',
        details: data
      });
    }

    return res.status(200).json({
      access: data.access,
      refresh: data.refresh,
      environment
    });

  } catch (error) {
    console.error('Exceção ao gerar token do Belvo:', error);
    return res.status(500).json({ error: error.message || 'Erro interno no servidor.' });
  }
}
