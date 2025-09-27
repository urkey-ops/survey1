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
    // *** FIX START ***
    // The client sends data fields directly on the 'submission' object, not nested under 'submission.data'.
    const source = submission;
    // *** FIX END ***
    
    const processedData = {
        // Core tracking fields
        // Now using 'source' (which is the submission object) instead of 'submission.data'
        id: source.id || 'N/A', 
        timestamp: source.timestamp || new Date().toISOString(),
        
        // is_incomplete check is derived from client-side state
        // (Note: client-side formData doesn't explicitly have this, but using source maintains original logic flow)
        is_incomplete: source.is_incomplete ? 'Yes' : 'No', 
        
        // Survey fields - Data is now correctly pulled directly from 'source'
        comments: (source.comments || '').trim(),
        satisfaction: source.satisfaction || '',
        cleanliness: source.cleanliness || '',
        staff_friendliness: source.staff_friendliness || '',
        
        // Handle Location (radio-with-other) logic - Now using 'source'
        location: (source.location === 'Other' && source.other_location)
            ? source.other_location.trim()
            : (source.location || ''),
            
        age: source.age || '',
        
        // Contact fields - Now using 'source'
        name: (source.name || '').trim(),
        email: (source.email || '').trim(),
        newsletterConsent: source.newsletterConsent || '',
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
