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
    
    // --- Updated Server-Side Validation and Sanitization ---
    
    // Validate that the email is present if consent is given
    if (newsletterConsent === 'Yes' && (!email || !/^\S+@\S+\.\S+$/.test(email))) {
      console.error('Validation Error: Email is required for subscription or format is invalid.');
      return response.status(400).json({ message: 'Email is required for subscription or format is invalid.' });
    }

    // --- Sanitize and format data for Google Sheets, allowing for missing fields ---
    const finalComments = (comments || '').trim();
    const finalSatisfaction = satisfaction || '';
    const finalCleanliness = cleanliness || '';
    const finalStaffFriendliness = staff_friendliness || '';
    const finalAge = age || '';
    const finalName = (name || '').trim();
    const finalEmail = (email || '').trim();
    const finalNewsletterConsent = newsletterConsent || '';

    // Handle "Other" location logic
    const finalLocation = (location === 'Other' && other_location) ? other_location.trim() : (location || '');
    
    // Define the correct order of columns for your Google Sheet
    const valuesToAppend = [
      (timestamp || new Date().toISOString()),
      id || '',
      finalComments,
      finalSatisfaction,
      finalCleanliness,
      finalStaffFriendliness,
      finalLocation,
      finalAge,
      finalName,
      finalEmail,
      finalNewsletterConsent,
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
