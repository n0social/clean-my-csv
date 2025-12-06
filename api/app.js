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
      // Serve the JavaScript file
      const jsPath = path.join(process.cwd(), 'public', 'app.js');
      
      if (fs.existsSync(jsPath)) {
        const jsContent = fs.readFileSync(jsPath, 'utf8');
        res.setHeader('Content-Type', 'application/javascript');
        res.status(200).send(jsContent);
      } else {
        res.status(404).json({ error: 'JavaScript file not found' });
      }
    } catch (error) {
      console.error('Error serving app.js:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};