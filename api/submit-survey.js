// This file is the Vercel serverless function for your survey submission API.
import { google } from 'googleapis';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

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
      other_location, // New field for the "Other" location text
      age,
      name,
      email,
      newsletterConsent, // New field for subscription status
    } = request.body;
    
    // --- Server-Side Validation and Sanitization ---
    
    // Validate required fields
    if (!comments || !satisfaction || !cleanliness || !staff_friendliness || !name) {
      console.error('Validation Error: Missing required fields.');
      return response.status(400).json({ message: 'Missing required survey data.' });
    }
    
    // Validate that the email is present if consent is given
    if (newsletterConsent === 'Yes' && (!email || !/^\S+@\S+\.\S+$/.test(email))) {
      console.error('Validation Error: Email is required for subscription or format is invalid.');
      return response.status(400).json({ message: 'Email is required for subscription or format is invalid.' });
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

    // Handle "Other" location logic
    const finalLocation = (location === 'Other' && other_location) ? other_location.trim() : (location || '');
    
    // Define the correct order of columns for your Google Sheet
    const valuesToAppend = [
      (timestamp || new Date().toISOString()),
      id || '',
      (comments || '').trim(),
      satisfaction,
      cleanliness,
      staff_friendliness,
      finalLocation,
      age || '',
      (name || '').trim(),
      (email || '').trim(),
      newsletterConsent || '',
    ];

    const resource = {
      values: [valuesToAppend],
    };

    const range = 'Sheet1!A:K';

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
