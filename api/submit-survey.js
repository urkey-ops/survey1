const { google } = require('googleapis');

// Pull the Spreadsheet ID directly from Vercel's environment variables
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Sheet1'; // Or whatever your sheet tab is named

// Initialize the Google Sheets API client
async function getGoogleSheetsClient() {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const authClient = await auth.getClient();
        return google.sheets({ version: 'v4', auth: authClient });
    } catch (error) {
        console.error("Authentication Error:", error);
        throw new Error("Failed to authenticate with Google Sheets API.");
    }
}

module.exports = async (request, response) => {
    // Only allow POST requests
    if (request.method !== 'POST') {
        return response.status(405).json({ message: "Method Not Allowed" });
    }

    // Check if the Spreadsheet ID is set
    if (!SPREADSHEET_ID) {
        console.error("SPREADSHEET_ID environment variable is not set.");
        return response.status(500).json({ message: "Server configuration error: SPREADSHEET_ID not found." });
    }

    try {
        const data = request.body;
        console.log("Received survey submission:", data);

        const sheets = await getGoogleSheetsClient();
        
        // Define the row to append, ensuring the order matches the data received from the client
        // The order should be: question, comments, satisfaction, cleanliness, staff_friendliness
        const row = [data.question, data.comments, data.satisfaction, data.cleanliness, data.staff_friendliness, new Date().toISOString()];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [row],
            },
        });

        console.log("Data appended to Google Sheet successfully.");
        return response.status(200).json({ message: "Survey submitted successfully!" });

    } catch (error) {
        console.error("Error processing submission:", error);
        return response.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};
