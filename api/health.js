module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    return res.json({ 
      status: 'OK', 
      message: 'Clean My CSV API is running',
      timestamp: new Date().toISOString(),
      openaiConfigured: !!process.env.OPENAI_API_KEY
    });
  }
  
  res.status(405).json({ error: 'Method not allowed' });
};