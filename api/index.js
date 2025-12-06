const fs = require('fs');
const path = require('path');

module.exports = function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    try {
      // Serve the main HTML file
      const htmlPath = path.join(process.cwd(), 'public', 'index.html');
      
      if (fs.existsSync(htmlPath)) {
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(htmlContent);
      } else {
        res.status(404).json({ error: 'Page not found' });
      }
    } catch (error) {
      console.error('Error serving index:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};