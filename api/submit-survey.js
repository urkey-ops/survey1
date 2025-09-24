// This file is the Vercel serverless function for your survey submission API.
import { google } from 'googleapis';

export default async function handler(request, response) {
  // Only allow POST requests to this endpoint.
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  // Check if a spreadsheet ID has been configured.
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('API Error: SPREADSHEET_ID environment variable is missing.');
    return response.status(500).json({ message: 'Server configuration error.' });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const {
      id,
      timestamp,
      comments,
      satisfaction,
      cleanliness,
      staff_friendliness,
      location,
      age,
      name,
      email,
      newsletterConsent,
    } = request.body;
    
    // --- Server-Side Validation (unchanged from your code) ---
    if (!comments || !satisfaction || !cleanliness || !staff_friendliness) {
      console.error('Validation Error: Missing required fields.');
      return response.status(400).json({ message: 'Missing required survey data.' });
    }
    
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      console.error('Validation Error: Invalid email format.');
      return response.status(400).json({ message: 'Invalid email format.' });
    }
    
    const cleanlinessRating = parseInt(cleanliness);
    if (isNaN(cleanlinessRating) || cleanlinessRating < 1 || cleanlinessRating > 5) {
      console.error('Validation Error: Invalid cleanliness rating.');
      return response.status(400).json({ message: 'Invalid cleanliness rating.' });
    }

    // --- Dynamic Data Mapping for Google Sheets ---
    // Define the column order in your Google Sheet (A, B, C, etc.)
    const columns = [
      'timestamp',
      'id',
      'comments',
      'satisfaction',
      'cleanliness',
      'staff_friendliness',
      'location',
      'age',
      'name',
      'email',
      'newsletterConsent',
    ];

    // Get the values from the request body in the correct order
    const valuesToAppend = columns.map(columnName => {
      // Use request.body to get the value for the corresponding column name
      // This will correctly handle missing or null values
      const value = request.body[columnName];
      // Return the value, or an empty string for missing data to ensure the row stays aligned.
      return value || '';
    });

    const resource = {
      values: [valuesToAppend],
    };

    // The range for the append operation. This will ensure data is added in the next available row from column A.
    // The previous issue was likely caused by the data itself having empty cells, and the append method skipping over them.
    const range = 'Sheet1!A:K';

    // Append the data to the Google Sheet.
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource,
    });

    console.log('Survey data successfully appended to Google Sheet.');

    response.status(200).json({ message: 'Survey submitted successfully!' });

  } catch (error) {
    console.error('API Error:', error.message);
    if (error.response) {
      console.error('API Response Data:', error.response.data);
    }
    
    response.status(500).json({ message: 'Internal Server Error' });
  }
}
