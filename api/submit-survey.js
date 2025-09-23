import { google } from 'googleapis';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
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
    const { question, comments, satisfaction, cleanliness, staff_friendliness } = request.body;

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = 'Sheet1!A:F';

    const values = [
      [
        new Date().toLocaleString(),
        question,
        comments,
        satisfaction,
        cleanliness,
        staff_friendliness,
      ],
    ];

    const resource = {
      values,
    };

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
