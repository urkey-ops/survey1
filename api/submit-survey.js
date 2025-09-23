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
    // Extract all fields from the request body, including the new ones.
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
      newsletterConsent
    } = request.body;
    
    // --- Server-Side Validation ---
    // Validate required fields to prevent empty submissions
    if (!comments || !satisfaction || !cleanliness || !staff_friendliness) {
      console.error('Validation Error: Missing required fields.');
      return response.status(400).json({ message: 'Missing required survey data.' });
    }
    
    // Optional: Add specific validation for email format if provided
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      console.error('Validation Error: Invalid email format.');
      return response.status(400).json({ message: 'Invalid email format.' });
    }
    
    // Optional: Add validation for specific field values (e.g., cleanliness scale)
    const cleanlinessRating = parseInt(cleanliness);
    if (isNaN(cleanlinessRating) || cleanlinessRating < 1 || cleanlinessRating > 5) {
      console.error('Validation Error: Invalid cleanliness rating.');
      return response.status(400).json({ message: 'Invalid cleanliness rating.' });
    }

    // The range now includes all new columns. Ensure your Google Sheet's columns match this order.
    // Example: A = Timestamp, B = ID, C = Comments, D = Satisfaction, E = Cleanliness, F = Staff Friendliness, etc.
    const range = 'Sheet1!A:K';

    const values = [
      [
        timestamp || new Date().toISOString(), // Use client-side timestamp, fall back to server timestamp
        id,
        comments,
        satisfaction,
        cleanliness,
        staff_friendliness,
        location,
        age,
        name,
        email,
        newsletterConsent,
      ],
    ];

    const resource = {
      values,
    };

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
