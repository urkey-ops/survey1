//data-util.js
// data-util.js

// --- Configuration ---
const DEBUG_MODE = true;
export const log = (message, ...args) => DEBUG_MODE && console.log(`[DEBUG] ${message}`, ...args);

export const config = {
    rotationSpeed: 50,
    rotationDisplayTime: 4000,
    resetTime: 5000,
    adminClicksRequired: 5,
    adminClickTimeout: 3000,
    inactivityTime: 30000,
    autoSubmitCountdown: 5,
    debounceDelay: 200,
};

// NOTE: Planned endpoint for Vercel Function + Google Sheets API
export const API_ENDPOINT = '/api/submit-survey'; 
export const LOCAL_STORAGE_KEY = 'surveySubmissions';

// --- Survey Questions Data: ALL REQUIRED: TRUE ---
export const surveyQuestions = [
    {
        id: 'comments',
        name: 'comments',
        type: 'textarea',
        question: '1. What did you like about your visit today?',
        placeholder: 'Type your comments here...',
        required: true, 
        rotatingText: [
            "1. What did you like about your visit today?",
            "1. What could we do better during your next visit?",
            "1. Do you have any general comments or suggestions?",
            "1. What was the most memorable part of your experience?"
        ]
    },
    {
        id: 'satisfaction',
        name: 'satisfaction',
        type: 'emoji-radio',
        question: '2. Overall, how satisfied were you with your visit today?',
        options: [
            { value: 'Sad', label: 'Sad', emoji: '😞' },
            { value: 'Neutral', label: 'Neutral', emoji: '😐' },
            { value: 'Happy', label: 'Happy', emoji: '😊' }
        ],
        required: true 
    },
    // ... include the rest of your surveyQuestions objects here ...
    {
        id: 'location',
        name: 'location',
        type: 'radio-with-other',
        question: 'Where are you visiting from today?',
        options: [
            { value: 'Lilburn/Gwinnett County', label: 'Lilburn/Gwinnett County' },
            { value: 'Greater Atlanta Area', label: 'Greater Atlanta Area' },
            { value: 'Georgia (outside Atlanta)', label: 'Georgia (outside GA)' },
            { value: 'United States (outside GA)', label: 'United States (outside GA)' },
            { value: 'Canada', label: 'Canada' },
            { value: 'India', label: 'India' },
            { value: 'Other', label: 'Other' }
        ],
        required: true 
    },
    {
        id: 'age',
        name: 'age',
        type: 'radio',
        question: 'Which age group do you belong to?',
        options: [
            { value: 'Under 18', label: 'Under 18' },
            { value: '18-40', label: '18-40' },
            { value: '40-65', label: '40-65' },
            { value: '65+' },
        ],
        required: true 
    },
    {
        id: 'contact',
        name: 'contact',
        type: 'custom-contact',
        question: 'Help us stay in touch.',
        required: true 
    }
];
// --- Helper Functions ---
export const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

export const showTemporaryMessage = (message, type = 'info') => {
    const statusMessage = document.getElementById('statusMessage');
    const className = type === 'error' ? 'bg-red-100 text-red-700' : (type === 'success' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700');
    statusMessage.textContent = message;
    statusMessage.className = `block p-4 mb-4 rounded-xl text-center font-medium ${className}`;
    statusMessage.style.display = 'block';
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
};

// --- Data Storage and API Communication ---
export const getStoredSubmissions = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');

export const storeSubmission = (submission) => {
    const submissions = getStoredSubmissions();
    submissions.push(submission);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
    showTemporaryMessage(`Submission saved locally. Queue size: ${submissions.length}.`, 'info');
};

export const removeSyncedSubmissions = (syncedIds) => {
    let submissions = getStoredSubmissions();
    const beforeCount = submissions.length;
    submissions = submissions.filter(sub => !syncedIds.includes(sub.id));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
    log(`Removed ${beforeCount - submissions.length} synced submissions. Remaining: ${submissions.length}`);
};

export const syncData = async () => {
    const submissions = getStoredSubmissions();
    if (submissions.length === 0) {
        log("No data to sync.");
        showTemporaryMessage("Sync successful (0 items).", 'success');
        return;
    }

    log(`Attempting to sync ${submissions.length} submissions...`);
    showTemporaryMessage(`Syncing ${submissions.length} submissions...`, 'info');

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissions })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        
        if (result.success && result.syncedIds.length > 0) {
            removeSyncedSubmissions(result.syncedIds);
            showTemporaryMessage(`Successfully synced ${result.syncedIds.length} submissions!`, 'success');
        } else {
             showTemporaryMessage("Sync failed on server side, check server logs.", 'error');
        }

    } catch (error) {
        console.error('Sync failed:', error);
        showTemporaryMessage("Network error during sync. Data saved locally.", 'error');
    }
};

// --- Admin Logic (needs a slight adjustment to be exported) ---
export const hideAdminControls = () => {
    const syncButton = document.getElementById('syncButton');
    const adminClearButton = document.getElementById('adminClearButton');
    const hideAdminButton = document.getElementById('hideAdminButton');
    syncButton.classList.add('hidden');
    adminClearButton.classList.add('hidden');
    hideAdminButton.classList.add('hidden');
    showTemporaryMessage("Admin controls hidden.", "info");
};
