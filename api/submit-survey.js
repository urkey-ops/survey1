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
    SHEET_NAME = 'Sheet1' 
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
    // --- 1. DESTRUCTURE and VALIDATE Core Payload ---
    const { id, timestamp, data } = request.body;

    if (!id || !timestamp || !data) {
      return response.status(400).json({ message: 'Invalid submission payload.' });
    }

    // --- 2. PREPARE and SANITIZE Data for Google Sheet ---
    // This object ensures all fields have a default value and are sanitized
    const submissionData = {
      // Use the ID and timestamp from the client for consistency
      id,
      timestamp,
      comments: (data.comments || '').trim(),
      satisfaction: data.satisfaction || '',
      cleanliness: data.cleanliness || '',
      staff_friendliness: data.staff_friendliness || '',
      location: (data.location === 'Other' && data.other_location)
        ? data.other_location.trim()
        : (data.location || ''),
      age: data.age || '',
      name: (data.name || '').trim(),
      email: (data.email || '').trim(),
      newsletterConsent: data.newsletterConsent || '',
      // Use a ternary check to determine if the submission is incomplete
      is_incomplete: data.is_incomplete ? 'Yes' : 'No', 
    };

    // --- 3. Define Column Order for Google Sheet ---
    // This is the single source of truth for your sheet's columns.
    // Ensure these match the headers in your Google Sheet.
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
      'is_incomplete',
    ];

    const valuesToAppend = columnOrder.map(key => submissionData[key] || '');

    // --- Append Data to Google Sheets ---
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`, 
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
