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
    
    // --- Server-Side Validation and Sanitization ---
    
    // Validate required fields to prevent empty submissions
    if (!comments || !satisfaction || !cleanliness || !staff_friendliness) {
      console.error('Validation Error: Missing required fields.');
      return response.status(400).json({ message: 'Missing required survey data.' });
    }
    
    // Validate that the email, if provided, is in a valid format.
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      console.error('Validation Error: Invalid email format.');
      return response.status(400).json({ message: 'Invalid email format.' });
    }

    // Validate cleanliness rating (must be an integer between 1 and 5)
    const cleanlinessRating = parseInt(cleanliness);
    if (isNaN(cleanlinessRating) || cleanlinessRating < 1 || cleanlinessRating > 5) {
      console.error('Validation Error: Invalid cleanliness rating.');
      return response.status(400).json({ message: 'Invalid cleanliness rating.' });
    }
    
    // Validate satisfaction rating (must be one of the expected string values)
    const validSatisfactionValues = ['Sad', 'Neutral', 'Happy'];
    if (!validSatisfactionValues.includes(satisfaction)) {
      console.error('Validation Error: Invalid satisfaction rating.');
      return response.status(400).json({ message: 'Invalid satisfaction rating.' });
    }
    
    // Validate staff friendliness rating (must be an integer between 1 and 5)
    const staffFriendlinessRating = parseInt(staff_friendliness);
    if (isNaN(staffFriendlinessRating) || staffFriendlinessRating < 1 || staffFriendlinessRating > 5) {
      console.error('Validation Error: Invalid staff friendliness rating.');
      return response.status(400).json({ message: 'Invalid staff friendliness rating.' });
    }

    // Define the correct order of columns for your Google Sheet (A, B, C, etc.).
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

    // Get the values from the request body in the correct order,
    // and sanitize string values by trimming whitespace.
    const valuesToAppend = columns.map(columnName => {
      let value = request.body[columnName];
      // Trim any string values to remove leading/trailing whitespace
      if (typeof value === 'string') {
        value = value.trim();
      }
      // Return the value, or an empty string for missing data to ensure row alignment.
      return value || '';
    });

    const resource = {
      values: [valuesToAppend],
    };

    // The range for the append operation. This ensures data is added in the next available row from column A.
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
