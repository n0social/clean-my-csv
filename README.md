# Clean My CSV

A web application that uses ChatGPT to clean and standardize CSV files. Perfect for cleaning messy marketing and sales data with AI-powered standardization.

## Features

- **AI-Powered Cleaning**: Uses OpenAI's GPT to intelligently standardize data
- **Custom Target Formats**: Describe exactly how you want your data formatted
- **Batch Processing**: Handles large CSV files with concurrency control
- **Easy Web Interface**: Simple drag-and-drop file upload
- **Instant Download**: Get your cleaned CSV file immediately

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your OpenAI API key:**
   Create a `.env` file in the project root:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   PORT=3000
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

## Usage

1. **Upload your CSV file** with messy data
2. **Specify the column name** you want to clean (e.g., "company_name", "email", "phone")
3. **Describe your target format** (e.g., "Proper case company names without Inc/LLC suffixes")
4. **Click "Clean My CSV"** and download your standardized file

## Example Target Formats

- **Company Names**: "Proper case, no Inc/LLC suffixes, standardized abbreviations"
- **Phone Numbers**: "(XXX) XXX-XXXX format, US numbers only"
- **Email Addresses**: "Lowercase, remove extra spaces"
- **City Names**: "Proper case, full city names (no abbreviations)"
- **Product Names**: "Title case, consistent brand naming"

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key | Yes |
| `PORT` | Server port (default: 3000) | No |

## API Endpoints

### POST `/api/clean-csv`
Upload and clean a CSV file.

**Parameters:**
- `csvFile` (file): The CSV file to clean
- `columnToClean` (string): Name of the column to standardize
- `targetFormat` (string): Description of desired output format

**Response:** Cleaned CSV file download

### GET `/api/health`
Health check endpoint.

## Development

```bash
# Install with dev dependencies
npm install

# Run with nodemon for development
npm run dev
```

## System Prompt

The application uses this system prompt for ChatGPT:

> "You are an expert Data Standardization Engineer specializing in marketing and sales data normalization. Your sole function is to take raw, inconsistent text and standardize it based on the user's provided target format. Your output must only contain the standardized text, with no extra commentary, explanations, or quotes."

## Rate Limiting

The application includes built-in rate limiting:
- Maximum 5 concurrent OpenAI API requests
- 100ms delay between batches to avoid rate limits
- Automatic retry logic for failed requests

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

If you encounter issues:
1. Check that your OpenAI API key is valid
2. Ensure your CSV file is properly formatted
3. Verify column names match exactly (case-sensitive)
4. Check the server logs for detailed error messages