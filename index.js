const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const htmlPath = path.join(__dirname, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (error) {
    console.error('Error serving index:', error);
    res.status(500).send('Internal Server Error');
  }
};