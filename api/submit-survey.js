// api/submit-survey.js

import { google } from 'googleapis';

// --- Define Column Order (Must match your Google Sheet headers) ---
const COLUMN_ORDER = [
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

// Function to clean and map a single submission object to the required array format
function processSingleSubmission(submission) {
    // Safely extract and clean data from the client payload
    const data = submission.data || {};
    const processedData = {
        // Core tracking fields
        id: submission.id || 'N/A',
        timestamp: submission.timestamp || new Date().toISOString(),
        is_incomplete: submission.is_incomplete ? 'Yes' : 'No',
        
        // Survey fields
        comments: (data.comments || '').trim(),
        satisfaction: data.satisfaction || '',
        cleanliness: data.cleanliness || '',
        staff_friendliness: data.staff_friendliness || '',
        
        // Handle Location (radio-with-other) logic
        location: (data.location === 'Other' && data.other_location)
            ? data.other_location.trim()
            : (data.location || ''),
            
        age: data.age || '',
        
        // Contact fields
        name: (data.name || '').trim(),
        email: (data.email || '').trim(),
        newsletterConsent: data.newsletterConsent || '',
    };
    
    // Map the processed data object to an array based on the defined column order
    return COLUMN_ORDER.map(key => processedData[key] || '');
}

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
        // --- 1. DESTRUCTURE ARRAY PAYLOAD ---
        const { submissions } = request.body;

        if (!Array.isArray(submissions) || submissions.length === 0) {
            return response.status(400).json({ message: 'Invalid payload: submissions array is missing or empty.' });
        }
        
        console.log(`Processing ${submissions.length} submissions.`);

        // --- 2. PREPARE DATA FOR BATCH APPEND ---
        const rowsToAppend = submissions.map(processSingleSubmission);
        
        // --- Append Data to Google Sheets ---
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A1`, 
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: rowsToAppend, // Now sending an array of arrays (rows)
            },
        });
        
        // --- SUCCESS RESPONSE ---
        // Crucially, send back the IDs of the submissions successfully processed.
        const syncedIds = submissions.map(sub => sub.id);
        
        console.log(`${syncedIds.length} submissions successfully appended to Google Sheet.`);
        return response.status(200).json({ 
            success: true,
            message: `${syncedIds.length} submissions processed.`,
            syncedIds: syncedIds // Used by data-util.js to clear local storage
        });

    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('API Response Data:', error.response.data);
        }
        return response.status(500).json({ 
            success: false,
            message: 'Internal Server Error during sheet append.',
            syncedIds: []
        });
    }
}
