const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.error('❌ ERROR: OpenAI API key is not set in .env file');
  console.log('Please:');
  console.log('1. Get your API key from: https://platform.openai.com/api-keys');
  console.log('2. Edit the .env file and replace "your_openai_api_key_here" with your actual key');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt for data standardization
const SYSTEM_PROMPT = "You are an expert Data Standardization Engineer specializing in marketing and sales data normalization. Your sole function is to take raw, inconsistent text and standardize it based on the user's provided target format. CRITICAL: You must follow the target format EXACTLY as specified - if it says UPPERCASE, make everything uppercase; if it says lowercase, make everything lowercase; if it says specific punctuation or formatting, apply it precisely. Your output must only contain the standardized text, with no extra commentary, explanations, or quotes. Never deviate from the specified format.";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
// Use /tmp directory for serverless environments like Vercel
const uploadDir = process.env.NODE_ENV === 'production' ? '/tmp' : 'uploads/';
const upload = multer({ dest: uploadDir });

// Ensure uploads directory exists
if (uploadDir !== '/tmp' && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Helper function to filter inappropriate characters based on column type
function filterInappropriateChars(text, columnType) {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text;
  
  switch (columnType) {
    case 'name':
      // Names should only have letters, spaces, apostrophes, hyphens, and dots
      cleaned = cleaned.replace(/[^a-zA-Z\s'\-\.]/g, '');
      break;
      
    case 'company':
      // Companies can have letters, numbers, spaces, and basic punctuation (but not $, @, etc.)
      cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-\.\,\(\)&]/g, '');
      break;
      
    case 'industry':
      // Industries should only have letters, spaces, and hyphens
      cleaned = cleaned.replace(/[^a-zA-Z\s\-]/g, '');
      break;
      
    case 'product':
      // Products can have letters, numbers, spaces, and basic punctuation
      cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-\.\+]/g, '');
      break;
      
    case 'phone':
      // Phones should only have numbers, spaces, parentheses, hyphens, and plus
      cleaned = cleaned.replace(/[^0-9\s\(\)\-\+\.]/g, '');
      break;
      
    case 'email':
      // Emails need letters, numbers, @, dots, hyphens, underscores
      cleaned = cleaned.replace(/[^a-zA-Z0-9@\.\-_]/g, '');
      break;
      
    case 'budget':
      // Budget should only have numbers, dollar signs, commas, periods, and letters for K/M
      cleaned = cleaned.replace(/[^0-9\$\,\.KMkm\s]/g, '');
      break;
      
    case 'city_state':
      // Cities/states should only have letters, spaces, commas
      cleaned = cleaned.replace(/[^a-zA-Z\s\,]/g, '');
      break;
      
    case 'address':
      // Addresses can have letters, numbers, spaces, and basic punctuation
      cleaned = cleaned.replace(/[^a-zA-Z0-9\s\-\.\,#]/g, '');
      break;
      
    case 'notes':
      // Notes can have most characters but filter out obviously wrong ones
      cleaned = cleaned.replace(/[\$@#%\^&\*]/g, '');
      break;
      
    case 'status':
      // Status should only have letters, spaces, and basic punctuation
      cleaned = cleaned.replace(/[^a-zA-Z\s\-]/g, '');
      break;
      
    default:
      // General cleanup - remove obviously inappropriate characters
      cleaned = cleaned.replace(/[\$@#%\^&\*]/g, '');
      break;
  }
  
  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

// Helper function to pre-standardize common patterns
function preStandardize(text, targetFormat) {
  if (!text || typeof text !== 'string') return text;
  
  let cleaned = text.trim();
  
  // Phone number standardization
  if (targetFormat.toLowerCase().includes('phone') || targetFormat.includes('XXX')) {
    // Remove common prefixes
    cleaned = cleaned.replace(/^(tel:|phone:|mobile:|cell:)\s*/i, '');
    // Remove extensions and suffixes
    cleaned = cleaned.replace(/\s*(ext|extension|x)\s*\d+/i, '');
    cleaned = cleaned.replace(/\s*\((mobile|work|home|cell)\)/i, '');
    // Extract just numbers
    const numbers = cleaned.replace(/\D/g, '');
    if (numbers.length === 10) {
      // Format as (XXX) XXX-XXXX
      cleaned = `(${numbers.slice(0,3)}) ${numbers.slice(3,6)}-${numbers.slice(6)}`;
    } else if (numbers.length === 11 && numbers.startsWith('1')) {
      // Remove country code
      const without1 = numbers.slice(1);
      cleaned = `(${without1.slice(0,3)}) ${without1.slice(3,6)}-${without1.slice(6)}`;
    }
  }
  
  // Email standardization
  else if (targetFormat.toLowerCase().includes('email') || targetFormat.includes('@')) {
    // Remove prefixes
    cleaned = cleaned.replace(/^(email:|e-mail:)\s*/i, '');
    // Remove suffixes
    cleaned = cleaned.replace(/\s*\((work|personal|home)\)/i, '');
    // Fix spacing around @
    cleaned = cleaned.replace(/\s+@\s*/, '@').replace(/@\s+/, '@');
    // Fix double @
    cleaned = cleaned.replace(/@@+/, '@');
    // Remove trailing dots
    cleaned = cleaned.replace(/\.$/, '');
    // Fix double dots
    cleaned = cleaned.replace(/\.\.+/g, '.');
    // Convert to lowercase (standard for emails)
    cleaned = cleaned.toLowerCase();
  }
  
  // Company name standardization
  else if (targetFormat.toLowerCase().includes('company') || targetFormat.toLowerCase().includes('business')) {
    // Remove special characters that don't belong
    cleaned = cleaned.replace(/[!@#$%^&*()]/g, '');
    // Fix multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    // Standardize common suffixes
    cleaned = cleaned.replace(/\b(corp|corporation)\b/gi, 'Corporation');
    cleaned = cleaned.replace(/\b(inc|incorporated)\b/gi, 'Inc');
    cleaned = cleaned.replace(/\b(llc|l\.l\.c\.)\b/gi, 'LLC');
    cleaned = cleaned.replace(/\b(ltd|limited)\b/gi, 'Ltd');
    // Basic title case for company names
    cleaned = cleaned.replace(/\b\w+/g, word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  }
  
  // Address standardization
  else if (targetFormat.toLowerCase().includes('address') || targetFormat.toLowerCase().includes('street')) {
    // Standardize street suffixes
    cleaned = cleaned.replace(/\b(st|str)\b\.?/gi, 'Street');
    cleaned = cleaned.replace(/\b(ave|av)\b\.?/gi, 'Avenue');
    cleaned = cleaned.replace(/\b(dr|drv)\b\.?/gi, 'Drive');
    cleaned = cleaned.replace(/\b(rd)\b\.?/gi, 'Road');
    cleaned = cleaned.replace(/\b(blvd|bld)\b\.?/gi, 'Boulevard');
    cleaned = cleaned.replace(/\b(ln)\b\.?/gi, 'Lane');
    cleaned = cleaned.replace(/\b(ct)\b\.?/gi, 'Court');
    // Title case
    cleaned = cleaned.replace(/\b\w+/g, word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  }
  
  // City/State standardization
  else if (targetFormat.toLowerCase().includes('city') || targetFormat.toLowerCase().includes('state')) {
    // Common state abbreviations
    const states = {
      'california': 'CA', 'calif': 'CA', 'texas': 'TX', 'florida': 'FL',
      'new york': 'NY', 'illinois': 'IL', 'pennsylvania': 'PA', 'penn': 'PA',
      'washington': 'WA', 'wash': 'WA', 'massachusetts': 'MA', 'georgia': 'GA',
      'arizona': 'AZ', 'colorado': 'CO', 'nevada': 'NV'
    };
    
    // City nicknames
    const cityNicknames = {
      'nyc': 'New York', 'la': 'Los Angeles', 'chi-town': 'Chicago',
      'atx': 'Austin', 'sf': 'San Francisco', 'atl': 'Atlanta',
      'beantown': 'Boston', 'mile high city': 'Denver'
    };
    
    let [city, state] = cleaned.split(',').map(s => s.trim());
    
    if (city && cityNicknames[city.toLowerCase()]) {
      city = cityNicknames[city.toLowerCase()];
    }
    
    if (state && states[state.toLowerCase()]) {
      state = states[state.toLowerCase()];
    }
    
    if (city && state) {
      // Title case city, uppercase state
      city = city.replace(/\b\w+/g, word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      );
      cleaned = `${city}, ${state.toUpperCase()}`;
    }
  }
  
  // Budget/Financial standardization
  else if (targetFormat.toLowerCase().includes('budget') || 
           targetFormat.toLowerCase().includes('price') || 
           targetFormat.toLowerCase().includes('cost') ||
           targetFormat.toLowerCase().includes('money') ||
           targetFormat.toLowerCase().includes('dollar')) {
    // Remove common prefixes
    cleaned = cleaned.replace(/^(budget:|price:|cost:)\s*/i, '');
    
    // Handle text numbers
    const textNumbers = {
      'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
      'twenty': '20', 'thirty': '30', 'forty': '40', 'fifty': '50',
      'sixty': '60', 'seventy': '70', 'eighty': '80', 'ninety': '90',
      'hundred': '00', 'thousand': '000', 'million': '000000'
    };
    
    let lowerCleaned = cleaned.toLowerCase();
    
    // Handle "twenty thousand", "fifty thousand", etc.
    if (lowerCleaned.includes('thousand')) {
      const match = lowerCleaned.match(/(\w+)\s*thousand/);
      if (match) {
        const prefix = textNumbers[match[1]] || match[1];
        cleaned = `$${prefix},000`;
      }
    }
    // Handle "five million", etc.
    else if (lowerCleaned.includes('million')) {
      const match = lowerCleaned.match(/(\w+)\s*million/);
      if (match) {
        const prefix = textNumbers[match[1]] || match[1];
        cleaned = `$${prefix},000,000`;
      }
    }
    // Handle abbreviations
    else {
      cleaned = cleaned.replace(/\bk\b/gi, '000');
      cleaned = cleaned.replace(/\bm\b/gi, '000000');
      
      // Extract numbers and format
      const numbers = cleaned.replace(/[^\d.,]/g, '');
      if (numbers && !isNaN(parseFloat(numbers))) {
        const num = parseFloat(numbers);
        if (num >= 1000000) {
          cleaned = `$${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
          cleaned = `$${(num / 1000).toFixed(0)}K`;
        } else {
          cleaned = `$${num.toLocaleString()}`;
        }
      }
    }
    
    // Handle placeholders
    if (/^(tbd|tba|to be determined|confidential|private|n\/a|na)$/i.test(cleaned)) {
      cleaned = 'TBD';
    }
  }
  
  // Industry standardization
  else if (targetFormat.toLowerCase().includes('industry') || 
           targetFormat.toLowerCase().includes('sector')) {
    const industries = {
      'tech': 'Technology',
      'it': 'Information Technology',
      'software dev': 'Software Development',
      'software development': 'Software Development',
      'ecommerce': 'E-commerce',
      'e-commerce': 'E-commerce',
      'social media': 'Social Media',
      'social networking': 'Social Media',
      'cloud services': 'Cloud Computing',
      'cloud computing': 'Cloud Computing',
      'fintech': 'Financial Technology',
      'financial technology': 'Financial Technology',
      'healthcare': 'Healthcare',
      'health care': 'Healthcare',
      'biotech': 'Biotechnology',
      'real estate': 'Real Estate',
      'realestate': 'Real Estate',
      'manufacturing': 'Manufacturing',
      'retail': 'Retail',
      'education': 'Education',
      'consulting': 'Consulting',
      'marketing': 'Marketing',
      'advertising': 'Advertising'
    };
    
    const normalized = industries[cleaned.toLowerCase()] || 
                      cleaned.replace(/\b\w+/g, word => 
                        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
                      );
    cleaned = normalized;
  }
  
  // Status/Priority standardization
  else if (targetFormat.toLowerCase().includes('status') || 
           targetFormat.toLowerCase().includes('priority') ||
           targetFormat.toLowerCase().includes('lead')) {
    const statuses = {
      'hot lead': 'Hot Lead',
      'warm lead': 'Warm Lead',
      'cold lead': 'Cold Lead',
      'hot prospect': 'Hot Lead',
      'warm prospect': 'Warm Lead',
      'qualified': 'Qualified',
      'unqualified': 'Unqualified',
      'interested': 'Interested',
      'not interested': 'Not Interested',
      'follow up': 'Follow Up',
      'follow-up': 'Follow Up',
      'callback': 'Callback',
      'voicemail': 'Voicemail',
      'no answer': 'No Answer',
      'do not call': 'Do Not Call',
      'dnc': 'Do Not Call'
    };
    
    cleaned = statuses[cleaned.toLowerCase()] || 
              cleaned.replace(/\b\w+/g, word => 
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
              );
  }
  
  // Notes/Comments standardization  
  else if (targetFormat.toLowerCase().includes('note') || 
           targetFormat.toLowerCase().includes('comment') ||
           targetFormat.toLowerCase().includes('remark')) {
    // Remove excessive punctuation
    cleaned = cleaned.replace(/!{2,}/g, '!');
    cleaned = cleaned.replace(/\?{2,}/g, '?');
    
    // Standardize common phrases
    cleaned = cleaned.replace(/\basap\b/gi, 'ASAP');
    cleaned = cleaned.replace(/\bmgmt\b/gi, 'management');
    cleaned = cleaned.replace(/\breq\.?\b/gi, 'required');
    cleaned = cleaned.replace(/\bw\/\b/gi, 'with');
    cleaned = cleaned.replace(/\b&\b/gi, 'and');
    
    // Proper sentence case
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  }
  
  // Product standardization
  else if (targetFormat.toLowerCase().includes('product')) {
    const products = {
      'iphone': 'iPhone',
      'macbook': 'MacBook', 
      'ipad': 'iPad',
      'airpods': 'AirPods',
      'apple watch': 'Apple Watch'
    };
    
    let productCleaned = cleaned.toLowerCase();
    Object.keys(products).forEach(key => {
      if (productCleaned.includes(key)) {
        cleaned = cleaned.replace(new RegExp(key, 'gi'), products[key]);
      }
    });
    
    // Title case for other products
    if (!Object.keys(products).some(key => productCleaned.includes(key))) {
      cleaned = cleaned.replace(/\b\w+/g, word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      );
    }
  }
  
  // Name standardization
  else if (targetFormat.toLowerCase().includes('name') && !targetFormat.toLowerCase().includes('company')) {
    // Remove titles and suffixes for basic cleaning
    cleaned = cleaned.replace(/\b(jr\.?|sr\.?|iii|ii|iv|phd|md|cpa|esq)\b/gi, '');
    // Fix multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    // Title case
    cleaned = cleaned.replace(/\b\w+/g, word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    );
  }
  
  // General cleanup for any remaining cases
  else {
    // Fix multiple spaces
    cleaned = cleaned.replace(/\s+/g, ' ');
    // Remove leading/trailing punctuation
    cleaned = cleaned.replace(/^[^\w]+|[^\w]+$/g, '');
  }
  
  return cleaned.trim();
}

// Helper function to clean text using OpenAI
async function cleanText(text, targetFormat) {
  try {
    // Check if this is a custom user format (not a standard auto-detected format)
    const isCustomFormat = !targetFormat.toLowerCase().includes('proper case') &&
                          !targetFormat.toLowerCase().includes('standardized') &&
                          !targetFormat.toLowerCase().includes('xxx') &&
                          targetFormat.length < 100; // Custom formats are usually shorter
    
    // For custom formats, skip pre-standardization and go straight to GPT
    if (isCustomFormat) {
      console.log(`🎯 Custom format detected, using GPT directly for: "${text}"`);
      
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

      const gptResult = response.choices[0].message.content.trim();
      console.log(`🎯 GPT result: "${text}" → "${gptResult}"`);
      return gptResult;
    }
    
    // For standard formats, apply rule-based standardization first
    const preStandardized = preStandardize(text, targetFormat);
    
    // If pre-standardization made significant changes, we might not need GPT
    const changesMade = preStandardized !== text.trim();
    
    // Only use GPT for more complex cases or when specifically requested
    const needsGPT = !changesMade || 
                     targetFormat.toLowerCase().includes('intelligent') ||
                     targetFormat.toLowerCase().includes('smart') ||
                     targetFormat.toLowerCase().includes('normalize') ||
                     preStandardized.length > 50; // Complex data might need GPT
    
    if (!needsGPT) {
      console.log(`✨ Pre-standardized: "${text}" → "${preStandardized}"`);
      return preStandardized;
    }
    
    console.log(`🤖 Using GPT for: "${preStandardized}"`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Target format: ${targetFormat}\n\nText to standardize: ${preStandardized}`
        }
      ],
      max_tokens: 150,
      temperature: 0.1
    });

    const gptResult = response.choices[0].message.content.trim();
    console.log(`🎯 GPT result: "${preStandardized}" → "${gptResult}"`);
    return gptResult;
  } catch (error) {
    console.error('Error cleaning text:', error);
    // Fall back to pre-standardized version if GPT fails
    const fallback = preStandardize(text, targetFormat);
    console.log(`⚠️ GPT failed, using pre-standardized: "${text}" → "${fallback}"`);
    return fallback;
  }
}

// Helper function to detect column type and suggest cleaning
function detectColumnType(columnName, sampleValues) {
  const name = columnName.toLowerCase();
  const samples = sampleValues.slice(0, 5).join(' ').toLowerCase();
  
  // Phone detection - must have phone indicators or phone-like patterns
  if (name.includes('phone') || name.includes('tel') || name.includes('mobile') || name.includes('cell')) {
    return 'phone';
  }
  if (samples.match(/\(\d{3}\)\s*\d{3}[-\s]\d{4}|\d{3}[-.\s]\d{3}[-.\s]\d{4}/)) {
    return 'phone';
  }
  
  // Email detection - must have email indicators
  if (name.includes('email') || name.includes('mail')) {
    return 'email';
  }
  if (samples.includes('@') && samples.match(/\w+@\w+\.\w+/)) {
    return 'email';
  }
  
  // Company detection - must specifically be company-related
  if (name.includes('company') || name.includes('business') || name.includes('organization') || name.includes('corp')) {
    return 'company';
  }
  
  // Address detection - must have address indicators
  if (name.includes('address') || name.includes('street') || name.includes('location')) {
    return 'address';
  }
  if (samples.match(/\d+\s+(st|street|ave|avenue|dr|drive|rd|road|blvd|boulevard)/)) {
    return 'address';
  }
  
  // City/State detection
  if (name.includes('city') || name.includes('state') || name.includes('location')) {
    return 'city_state';
  }
  
  // Budget detection - must be specifically budget/money related
  if (name.includes('budget') || name.includes('price') || name.includes('cost') || name.includes('money') || name.includes('revenue') || name.includes('salary')) {
    return 'budget';
  }
  // Only detect as budget if samples clearly contain currency indicators
  if (samples.match(/\$\d+|^\d+k$|thousand|million/) && !name.includes('name') && !name.includes('person') && !name.includes('contact')) {
    return 'budget';
  }
  
  // Industry detection
  if (name.includes('industry') || name.includes('sector') || name.includes('business_type')) {
    return 'industry';
  }
  
  // Status detection
  if (name.includes('status') || name.includes('priority') || name.includes('lead') || name.includes('stage')) {
    return 'status';
  }
  
  // Notes detection
  if (name.includes('note') || name.includes('comment') || name.includes('remark') || name.includes('description')) {
    return 'notes';
  }
  
  // Product detection
  if (name.includes('product') || name.includes('item') || name.includes('service')) {
    return 'product';
  }
  
  // Name detection - must be specifically name-related and NOT company
  if ((name.includes('name') || name.includes('contact') || name.includes('person')) && 
      !name.includes('company') && !name.includes('business')) {
    return 'name';
  }
  
  return 'general';
}

// Helper function to get target format based on column type
function getTargetFormat(columnType, columnName) {
  const formats = {
    phone: 'Phone numbers in (XXX) XXX-XXXX format',
    email: 'Lowercase email addresses with proper formatting',
    company: 'Proper case company names with standardized suffixes (Inc, LLC, Corp)',
    address: 'Proper case street addresses with standardized abbreviations (Street, Avenue, Drive)',
    city_state: 'Proper case city names with standardized state abbreviations (City, ST)',
    budget: 'Standardized currency format ($X,XXX or $XK for thousands)',
    industry: 'Standardized industry names in proper case',
    status: 'Standardized status values (Hot Lead, Warm Lead, etc.)',
    notes: 'Proper sentence case with standardized abbreviations',
    product: 'Proper case product names with correct brand formatting',
    name: 'Proper case personal names without titles',
    general: `Clean and standardize ${columnName} data`
  };
  
  return formats[columnType] || formats.general;
}

// Helper function to consolidate duplicates within a column
function consolidateDuplicates(data, columnName) {
  // Create a mapping of similar values to their best canonical form
  const valueGroups = {};
  const canonicalMap = {};
  
  // First pass: group similar values
  data.forEach(row => {
    if (!row[columnName]) return;
    
    const value = row[columnName].trim();
    const normalizedKey = value.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Normalize spaces
      .trim();
    
    if (!valueGroups[normalizedKey]) {
      valueGroups[normalizedKey] = [];
    }
    valueGroups[normalizedKey].push(value);
  });
  
  // Second pass: pick the best canonical form for each group
  Object.keys(valueGroups).forEach(key => {
    const variants = [...new Set(valueGroups[key])]; // Remove exact duplicates
    
    if (variants.length > 1) {
      // Pick the best canonical form based on these criteria:
      // 1. Proper case (not all caps or all lowercase)
      // 2. Complete spelling (longer is often better)
      // 3. Standard formatting
      
      const best = variants.reduce((best, current) => {
        // Prefer proper case over all caps or all lowercase
        const currentHasProperCase = /^[A-Z][a-z]/.test(current) && /[a-z]/.test(current) && !/^[A-Z]+$/.test(current);
        const bestHasProperCase = /^[A-Z][a-z]/.test(best) && /[a-z]/.test(best) && !/^[A-Z]+$/.test(best);
        
        if (currentHasProperCase && !bestHasProperCase) return current;
        if (!currentHasProperCase && bestHasProperCase) return best;
        
        // Prefer longer, more complete forms
        if (current.length > best.length) return current;
        if (current.length < best.length) return best;
        
        // Prefer the one that appears first alphabetically (consistent choice)
        return current < best ? current : best;
      });
      
      // Map all variants to the best form
      variants.forEach(variant => {
        canonicalMap[variant] = best;
      });
      
      console.log(`🔗 Consolidating duplicates: ${variants.join(' / ')} → "${best}"`);
    }
  });
  
  // Third pass: apply the canonical mapping
  data.forEach(row => {
    if (row[columnName] && canonicalMap[row[columnName]]) {
      row[columnName] = canonicalMap[row[columnName]];
    }
  });
  
  return data;
}

// Process CSV with automatic column detection and cleaning
async function processCSV(inputPath, outputPath, specificColumn = null, specificFormat = null) {
  const data = [];
  
  // Read CSV
  return new Promise((resolve, reject) => {
    fs.createReadStream(inputPath)
      .pipe(csv())
      .on('data', (row) => {
        data.push(row);
      })
      .on('end', async () => {
        try {
          const headers = Object.keys(data[0]);
          console.log(`📊 Found ${data.length} rows with columns: ${headers.join(', ')}`);
          
          // Detect column types and determine what needs cleaning
          const columnInfo = headers.map(header => {
            const sampleValues = data.slice(0, 10).map(row => row[header]).filter(val => val && val.trim());
            const detectedType = detectColumnType(header, sampleValues);
            return {
              name: header,
              type: detectedType,
              targetFormat: getTargetFormat(detectedType, header),
              needsCleaning: detectedType !== 'general' || sampleValues.some(val => 
                val !== val.trim() || // has leading/trailing spaces
                val.includes('  ') || // has multiple spaces
                /[A-Z]{3,}/.test(val) || // has all caps words
                /[a-z]{3,}/.test(val.split(' ')[0]) // first word is all lowercase
              )
            };
          });
          
          // Log what we're going to clean
          const columnsToClean = specificColumn ? 
            columnInfo.filter(col => {
              // Flexible column matching: exact match, case-insensitive, or normalized match
              const userInput = specificColumn.toLowerCase().replace(/[\s_]/g, '');
              const columnName = col.name.toLowerCase().replace(/[\s_]/g, '');
              const columnWords = col.name.toLowerCase().split(/[\s_]/);
              const userWords = specificColumn.toLowerCase().split(/[\s_]/);
              
              return col.name.toLowerCase() === specificColumn.toLowerCase() ||
                     columnName === userInput ||
                     columnWords.some(word => userWords.includes(word)) ||
                     userWords.some(word => columnWords.includes(word));
            }) :
            columnInfo.filter(col => col.needsCleaning);
            
          // If specific column was requested but not found, log error
          if (specificColumn && columnsToClean.length === 0) {
            console.error(`❌ Column '${specificColumn}' not found. Available columns: ${headers.join(', ')}`);
            throw new Error(`Column '${specificColumn}' not found. Available columns: ${headers.join(', ')}`);
          }
          
          // Override target format for specific column requests
          if (specificColumn && specificFormat && columnsToClean.length > 0) {
            columnsToClean[0].targetFormat = specificFormat;
            console.log(`🎯 Using custom format for '${specificColumn}' (matched: '${columnsToClean[0].name}'): ${specificFormat}`);
          } else if (specificColumn && columnsToClean.length > 0) {
            console.log(`🎯 Found matching column for '${specificColumn}': '${columnsToClean[0].name}'`);
          }
            
          console.log(`🎯 Will clean these columns:`);
          columnsToClean.forEach(col => {
            console.log(`   • ${col.name} (${col.type}): ${col.targetFormat}`);
          });
          
          // Also apply character filtering to ALL columns, not just ones that need cleaning
          const allColumnsForFiltering = columnInfo;
          
          if (columnsToClean.length === 0) {
            console.log('✅ No columns need cleaning - data looks good!');
            // Just copy the file
            fs.copyFileSync(inputPath, outputPath);
            resolve(outputPath);
            return;
          }
          
          // Process rows with concurrency control (max 3 concurrent requests to avoid rate limits)
          const batchSize = 3;
          let processedData = [];
          
          for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const promises = batch.map(async (row) => {
              const cleanedRow = { ...row };
              
              // First: Apply character filtering to ALL columns based on their detected type
              allColumnsForFiltering.forEach(colInfo => {
                if (cleanedRow[colInfo.name]) {
                  const original = cleanedRow[colInfo.name];
                  cleanedRow[colInfo.name] = filterInappropriateChars(original, colInfo.type);
                  if (cleanedRow[colInfo.name] !== original) {
                    console.log(`🧹 Filtered ${colInfo.name}: "${original}" → "${cleanedRow[colInfo.name]}"`);
                  }
                }
              });
              
              // Second: Apply AI/rule-based cleaning to columns that need it
              for (const colInfo of columnsToClean) {
                if (cleanedRow[colInfo.name]) {
                  const originalValue = cleanedRow[colInfo.name];
                  const targetFormat = colInfo.targetFormat; // Use the format from columnInfo
                    
                  cleanedRow[colInfo.name] = await cleanText(originalValue, targetFormat);
                  
                  if (cleanedRow[colInfo.name] !== originalValue) {
                    console.log(`✨ ${colInfo.name}: "${originalValue}" → "${cleanedRow[colInfo.name]}"`);
                  }
                }
              }
              
              return cleanedRow;
            });
            
          const batchResults = await Promise.all(promises);
          processedData.push(...batchResults);
          
          // Progress update
          console.log(`📊 Processed ${Math.min(i + batchSize, data.length)}/${data.length} rows`);
          
          // Add small delay to avoid rate limiting
          if (i + batchSize < data.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        // Post-processing: Consolidate duplicates for key columns
        console.log(`🔗 Consolidating duplicates...`);
        columnsToClean.forEach(colInfo => {
          if (['company', 'name', 'product', 'industry'].includes(colInfo.type)) {
            processedData = consolidateDuplicates(processedData, colInfo.name);
          }
        });
        
        // Write cleaned CSV
          const csvWriter = createCsvWriter({
            path: outputPath,
            header: headers.map(header => ({ id: header, title: header }))
          });
          
          await csvWriter.writeRecords(processedData);
          console.log(`✅ Cleaned CSV written to ${outputPath}`);
          resolve(outputPath);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

// Routes
app.post('/api/clean-csv', upload.single('csvFile'), async (req, res) => {
  try {
    const { columnToClean, targetFormat } = req.body;
    
    console.log(`🔄 Processing CSV file: ${req.file?.originalname}`);
    console.log(`📋 Column to clean: ${columnToClean || 'AUTO-DETECT ALL'}`);
    console.log(`🎯 Target format: ${targetFormat || 'AUTO-STANDARDIZE'}`);
    
    if (!req.file) {
      console.error('❌ No file uploaded');
      return res.status(400).json({ 
        error: 'No CSV file uploaded' 
      });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(uploadDir, `cleaned_${Date.now()}_${req.file.originalname}`);
    
    console.log(`📂 Input file: ${inputPath}`);
    console.log(`📂 Output file: ${outputPath}`);
    
    // Process the CSV file
    // If specific column is provided, clean just that column (format optional)
    // Otherwise, auto-detect and clean all messy columns
    if (columnToClean) {
      const format = targetFormat || 'Standardize and clean this data appropriately';
      console.log(`🎯 Specific cleaning: ${columnToClean} → ${format}`);
      await processCSV(inputPath, outputPath, columnToClean, format);
    } else {
      console.log(`🤖 Auto-detecting and cleaning all messy columns...`);
      await processCSV(inputPath, outputPath);
    }
    
    console.log('✅ CSV processing completed successfully');
    
    // Send the cleaned file
    res.download(outputPath, `cleaned_${req.file.originalname}`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
      }
      
      // Cleanup files
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
    });
    
  } catch (error) {
    console.error('❌ Error processing CSV:', error);
    res.status(500).json({ error: `Failed to process CSV file: ${error.message}` });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Clean My CSV API is running' });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Clean My CSV server running on http://localhost:${PORT}`);
    console.log(`📁 Upload directory: ${path.resolve('uploads')}`);
    console.log(`🔑 OpenAI API key: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
    console.log('Ready to clean some CSVs! 🧹');
  });
}

// Export for Vercel serverless functions
module.exports = app;