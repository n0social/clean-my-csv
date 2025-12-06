const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads (use /tmp for Vercel)
const upload = multer({ dest: '/tmp/' });

// System prompt for data standardization
const SYSTEM_PROMPT = "You are an expert Data Standardization Engineer specializing in marketing and sales data normalization. Your sole function is to take raw, inconsistent text and standardize it based on the user's provided target format. CRITICAL: You must follow the target format EXACTLY as specified - if it says UPPERCASE, make everything uppercase; if it says lowercase, make everything lowercase; if it says specific punctuation or formatting, apply it precisely. Your output must only contain the standardized text, with no extra commentary, explanations, or quotes. Never deviate from the specified format.";

// Helper functions (copying key functions from server.js)
function filterInappropriateChars(text, columnType) {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text;
  
  // Remove null characters, control characters, and other problematic characters
  cleaned = cleaned.replace(/\x00/g, ''); // null characters
  cleaned = cleaned.replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // control characters
  cleaned = cleaned.replace(/\uFEFF/g, ''); // BOM
  cleaned = cleaned.replace(/\u200B/g, ''); // zero width space
  
  // Column-specific character filtering
  switch (columnType) {
    case 'name':
      cleaned = cleaned.replace(/[^a-zA-Z\s'\-\.]/g, '');
      break;
    case 'company':
      cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-\.\,\(\)&]/g, '');
      break;
    case 'email':
      cleaned = cleaned.replace(/[^a-zA-Z0-9@\.\-_]/g, '');
      break;
    case 'phone':
      cleaned = cleaned.replace(/[^0-9\s\(\)\-\+\.]/g, '');
      break;
    case 'budget':
      cleaned = cleaned.replace(/[^0-9\$\,\.KMkm\s]/g, '');
      break;
    default:
      cleaned = cleaned.replace(/[\$@#%\^&\*]/g, '');
      break;
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

async function cleanText(text, targetFormat) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Target format: ${targetFormat}\n\nText to standardize: ${text}`
        }
      ],
      max_tokens: 150,
      temperature: 0.1
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error cleaning text:', error);
    return text;
  }
}

function detectColumnType(columnName, sampleValues) {
  const name = columnName.toLowerCase();
  const samples = sampleValues.slice(0, 5).join(' ').toLowerCase();
  
  if (name.includes('phone') || name.includes('tel') || name.includes('mobile') || name.includes('cell')) {
    return 'phone';
  }
  if (name.includes('email') || name.includes('mail')) {
    return 'email';
  }
  if (name.includes('company') || name.includes('business') || name.includes('organization') || name.includes('corp')) {
    return 'company';
  }
  if (name.includes('budget') || name.includes('price') || name.includes('cost') || name.includes('money')) {
    return 'budget';
  }
  if ((name.includes('name') || name.includes('contact') || name.includes('person')) && 
      !name.includes('company') && !name.includes('business')) {
    return 'name';
  }
  
  return 'general';
}

function getTargetFormat(columnType, columnName) {
  const formats = {
    phone: 'Phone numbers in (XXX) XXX-XXXX format',
    email: 'Lowercase email addresses with proper formatting',
    company: 'Proper case company names with standardized suffixes (Inc, LLC, Corp)',
    budget: 'Standardized currency format ($X,XXX or $XK for thousands)',
    name: 'Proper case personal names without titles',
    general: `Clean and standardize ${columnName} data`
  };
  
  return formats[columnType] || formats.general;
}

async function processCSV(inputPath, outputPath, specificColumn = null, specificFormat = null) {
  const data = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row) => {
        data.push(row);
      })
      .on('end', async () => {
        try {
          const headers = Object.keys(data[0]);
          
          const columnInfo = headers.map(header => {
            const sampleValues = data.slice(0, 10).map(row => row[header]).filter(val => val && val.trim());
            const detectedType = detectColumnType(header, sampleValues);
            return {
              name: header,
              type: detectedType,
              targetFormat: getTargetFormat(detectedType, header),
              needsCleaning: detectedType !== 'general'
            };
          });
          
          const columnsToClean = specificColumn ? 
            columnInfo.filter(col => {
              const userInput = specificColumn.toLowerCase().replace(/[\s_]/g, '');
              const columnName = col.name.toLowerCase().replace(/[\s_]/g, '');
              return col.name.toLowerCase() === specificColumn.toLowerCase() || columnName === userInput;
            }) :
            columnInfo.filter(col => col.needsCleaning);
            
          if (specificColumn && specificFormat && columnsToClean.length > 0) {
            columnsToClean[0].targetFormat = specificFormat;
          }
          
          if (columnsToClean.length === 0) {
            fs.copyFileSync(inputPath, outputPath);
            resolve(outputPath);
            return;
          }
          
          let processedData = [];
          
          for (let i = 0; i < data.length; i += 3) {
            const batch = data.slice(i, i + 3);
            const promises = batch.map(async (row) => {
              const cleanedRow = { ...row };
              
              for (const colInfo of columnsToClean) {
                if (cleanedRow[colInfo.name]) {
                  const originalValue = cleanedRow[colInfo.name];
                  const filtered = filterInappropriateChars(originalValue, colInfo.type);
                  cleanedRow[colInfo.name] = await cleanText(filtered, colInfo.targetFormat);
                }
              }
              
              return cleanedRow;
            });
            
            const batchResults = await Promise.all(promises);
            processedData.push(...batchResults);
            
            if (i + 3 < data.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          }
          
          const csvWriter = createCsvWriter({
            path: outputPath,
            header: headers.map(header => ({ id: header, title: header }))
          });
          
          await csvWriter.writeRecords(processedData);
          resolve(outputPath);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

// Main API handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'GET' && req.url === '/api/health') {
    return res.json({ status: 'OK', message: 'Clean My CSV API is running' });
  }
  
  if (req.method === 'POST' && req.url === '/api/clean-csv') {
    try {
      // Handle multipart form data
      const uploadMiddleware = upload.single('csvFile');
      
      await new Promise((resolve, reject) => {
        uploadMiddleware(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      const { columnToClean, targetFormat } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded' });
      }

      const inputPath = req.file.path;
      const outputPath = path.join('/tmp', `cleaned_${Date.now()}_${req.file.originalname}`);
      
      await processCSV(inputPath, outputPath, columnToClean, targetFormat);
      
      // Read the processed file and send it
      const fileContent = fs.readFileSync(outputPath);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="cleaned_${req.file.originalname}"`);
      res.send(fileContent);
      
      // Cleanup
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
      
    } catch (error) {
      console.error('Error processing CSV:', error);
      res.status(500).json({ error: `Failed to process CSV file: ${error.message}` });
    }
  } else {
    res.status(404).json({ error: 'Not found' });
  }
}