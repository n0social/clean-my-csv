const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const jsPath = path.join(__dirname, 'app.js');
    const js = fs.readFileSync(jsPath, 'utf8');
    
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.status(200).send(js);
  } catch (error) {
    console.error('Error serving app.js:', error);
    res.status(404).send('Not Found');
  }
};