// --- api/submit-survey.js (Version 11 - Vercel Function for Google Sheets API) ---

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
    'sync_status', // Use sync_status to capture 'unsynced', 'unsynced (inactivity)'
];

/**
 * Transforms a single submission object (sent from the client queue) into a
 * flat array that matches the SHEET's COLUMN_ORDER.
 * * @param {Object} submission - A single survey data object from the client queue.
 * @returns {Array} An array of values ready for Google Sheets batch append.
 */
function processSingleSubmission(submission) {
    // The client sends data fields directly on the 'submission' object.
    const source = submission;
    
    const processedData = {
        // Core tracking fields
        id: source.id || 'N/A', 
        timestamp: source.timestamp || new Date().toISOString(),
        // Map the sync_status field directly
        sync_status: source.sync_status || 'unsynced', 
        
        // Survey fields
        comments: (source.comments || '').trim(),
        satisfaction: source.satisfaction || '',
        cleanliness: source.cleanliness || '',
        staff_friendliness: source.staff_friendliness || '',
        
        // Handle Location (radio-with-other) logic
        location: (source.location === 'Other' && source.other_location)
            ? source.other_location.trim()
            : (source.location || ''),
            
        age: source.age || '',
        
        // Contact fields
        name: (source.name || '').trim(),
        email: (source.email || '').trim(),
        newsletterConsent: source.newsletterConsent || '',
    };
    
    // Map the processed data object to an array based on the defined column order
    // If a key is missing in processedData, it defaults to an empty string.
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
            // Return a successful status for an empty array to match client expectations
            return response.status(200).json({ 
                success: true, 
                message: 'No submissions received.',
                syncedIds: [] 
            });
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
                values: rowsToAppend,
            },
        });
        
        // --- SUCCESS RESPONSE ---
        // VITAL FOR V11: Get all IDs from the successful batch and return them.
        const syncedIds = submissions.map(sub => sub.id);
        
        console.log(`${syncedIds.length} submissions successfully appended to Google Sheet.`);
        return response.status(200).json({ 
            success: true,
            message: `${syncedIds.length} submissions processed.`,
            **successfulIds**: syncedIds // Client-side V11 expects 'successfulIds'
        });

    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('API Response Data:', error.response.data);
        }
        
        // VITAL FOR V11: On ANY failure (500), return an empty array of IDs
        // This tells the client to keep ALL submissions in the queue.
        return response.status(500).json({ 
            success: false,
            message: 'Internal Server Error during sheet append. Data retained locally.',
            **successfulIds**: []
        });
    }
}
