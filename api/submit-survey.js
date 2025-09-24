// This file is the Vercel serverless function for your survey submission API.
import { google } from 'googleapis';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  // --- Configuration from Environment Variables ---
  const { 
    SPREADSHEET_ID, 
    GOOGLE_SERVICE_ACCOUNT_EMAIL, 
    GOOGLE_PRIVATE_KEY,
    SHEET_NAME = 'Sheet1' // Default to 'Sheet1' if not set
  } = process.env;

  if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error('API Error: Missing one or more required environment variables.');
    return response.status(500).json({ message: 'Server configuration error.' });
  }

  // --- Google Sheets Authentication ---
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // --- 1. CORRECTLY Destructure Nested Data from Request Body ---
    const { id, timestamp, data } = request.body;

    // --- 2. ENHANCED Server-Side Validation ---
    if (!id || !timestamp || !data) {
      return response.status(400).json({ message: 'Invalid submission payload.' });
    }
    if (data.newsletterConsent === 'Yes' && (!data.email || !/^\S+@\S+\.\S+$/.test(data.email))) {
      return response.status(400).json({ message: 'A valid email is required for subscription.' });
    }
    // Example of more validation: ensure cleanliness is a number between 1 and 5
    if (data.cleanliness && !/^[1-5]$/.test(data.cleanliness)) {
        return response.status(400).json({ message: 'Invalid value for cleanliness rating.' });
    }

    // --- 3. Sanitize and Format Data ---
    const sanitizedData = {
      id,
      timestamp: timestamp || new Date().toISOString(),
      comments: (data.comments || '').trim(),
      satisfaction: data.satisfaction || '',
      cleanliness: data.cleanliness || '',
      staff_friendliness: data.staff_friendliness || '',
      // Handle "Other" location logic
      location: (data.location === 'Other' && data.other_location) 
                ? data.other_location.trim() 
                : (data.location || ''),
      age: data.age || '',
      name: (data.name || '').trim(),
      email: (data.email || '').trim(),
      newsletterConsent: data.newsletterConsent || '',
    };
    
    // --- 4. IMPROVED Maintainability with a Column Order Array ---
    // This array defines the exact order of columns in your Google Sheet.
    // To add/remove/reorder columns, you only need to change this one line!
    const columnOrder = [
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

    const valuesToAppend = columnOrder.map(key => sanitizedData[key] || '');

    // --- Append Data to Google Sheets ---
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`, // Append to the first empty row of the specified sheet
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [valuesToAppend],
      },
    });

    console.log('Survey data successfully appended to Google Sheet.');
    return response.status(200).json({ message: 'Survey submitted successfully!' });

  } catch (error) {
    console.error('API Error:', error.message);
    if (error.response) {
      console.error('API Response Data:', error.response.data);
    }
    return response.status(500).json({ message: 'Internal Server Error' });
  }
}
