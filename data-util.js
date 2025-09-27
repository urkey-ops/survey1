/*
|--------------------------------------------------------------------------
| Survey Data and Utility Functions (data-util.js)
|--------------------------------------------------------------------------
| This file holds all hardcoded survey content, configuration, and client-side 
| utility functions for logging, storage, and synchronization.
*/

// --- Configuration ---
export const config = {
    // UI Settings
    inactivityTime: 60000, // 60 seconds of inactivity before warning
    autoSubmitCountdown: 10, // Seconds before auto-submitting
    adminClicksRequired: 7, // Number of clicks to enable admin menu
    adminClickTimeout: 3000, // Time window for admin clicks (3 seconds)
    
    // Question Rotation Settings (For Q1)
    rotationInterval: 5000, // Time between starting the typewriter effect
    rotationDisplayTime: 4000, // Time to display text before next rotation
    rotationSpeed: 50, // Typing speed (ms per character)
};

// --- Survey Questions (Complete List: 5 Questions for Q1 -> Q5 Flow) ---
export const surveyQuestions = [
    {
        id: 'q1',
        name: 'satisfaction_text',
        type: 'textarea',
        question: 'How was your experience today?',
        placeholder: 'Tell us more about your visit...',
        required: true,
        // The first question has rotating text for the idle screen
        rotatingText: [
            "We value your feedback!",
            "How was your experience today?",
            "What can we do better?",
            "Click here to share your thoughts."
        ]
    },
    {
        id: 'q2',
        name: 'store_rating',
        type: 'emoji-radio',
        question: 'Overall, how would you rate your visit?',
        required: true,
        options: [
            { value: 'bad', emoji: '😞', label: 'Bad' },
            { value: 'poor', emoji: '😟', label: 'Poor' },
            { value: 'neutral', emoji: '😐', label: 'Neutral' },
            { value: 'good', emoji: '😊', label: 'Good' },
            { value: 'excellent', emoji: '🤩', label: 'Excellent' }
        ]
    },
    {
        id: 'q3',
        name: 'reason_rating',
        type: 'radio',
        question: 'What was the main reason for your rating?',
        required: true,
        options: [
            { value: 'service', label: 'Staff Service' },
            { value: 'product_quality', label: 'Product Quality' },
            { value: 'cleanliness', label: 'Store Cleanliness' },
            { value: 'atmosphere', label: 'Atmosphere/Environment' },
        ]
    },
    {
        id: 'q4',
        name: 'recommendation_other',
        type: 'radio-with-other', // Requires logic in app.js to handle the 'other' text input
        question: 'Would you recommend us to a friend?',
        required: true,
        options: [
            { value: 'yes', label: 'Yes, definitely' },
            { value: 'no', label: 'No, not now' },
            { value: 'maybe', label: 'Maybe' },
            { value: 'other', label: 'Other (please specify)' }
        ]
    },
    {
        id: 'q5',
        name: 'contact_info',
        type: 'custom-contact',
        question: 'If you would like a follow-up, please provide your email:',
        placeholder: 'Enter your email address',
        required: false,
    }
];

// --- Utility Functions ---

/**
 * Simple logging utility (can be replaced by a more robust solution later)
 * @param {string} message 
 * @param {any} data 
 */
export const log = (message, data = null) => {
    console.log(`[Kiosk Survey] ${message}`, data || '');
};

/**
 * Generates a simple UUID (v4-like)
 * @returns {string}
 */
export const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

/**
 * Stores a survey submission in local storage.
 * @param {Object} submission 
 */
export const storeSubmission = (submission) => {
    try {
        const submissions = JSON.parse(localStorage.getItem('surveySubmissions') || '[]');
        submissions.push(submission);
        localStorage.setItem('surveySubmissions', JSON.stringify(submissions));
        log(`Submission stored locally. Total: ${submissions.length}`);
        showTemporaryMessage("Feedback saved locally!", "success");
    } catch (e) {
        log("Error storing submission locally:", e);
        showTemporaryMessage("Error saving feedback.", "error");
    }
};

/**
 * Placeholder for data synchronization logic (sends data to server/GSheet)
 */
export const syncData = async () => {
    log("Attempting to sync data...");
    // In a real application, this is where a fetch() call to the Vercel 
    // function would happen to push data to Google Sheets.
    
    // Dummy Success/Failure simulation
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    
    showTemporaryMessage("Sync functionality is currently a placeholder.", "info");
};

/**
 * Displays a temporary status message to the user.
 * @param {string} message 
 * @param {string} type 'success', 'error', or 'info'
 */
export const showTemporaryMessage = (message, type = 'info') => {
    const statusMessageElement = document.getElementById('statusMessage');
    if (!statusMessageElement) return;

    // Remove previous classes
    statusMessageElement.classList.remove('bg-green-100', 'bg-red-100', 'bg-blue-100', 'text-green-800', 'text-red-800', 'text-blue-800', 'hidden');

    // Set new classes based on type
    switch (type) {
        case 'success':
            statusMessageElement.classList.add('bg-green-100', 'text-green-800');
            break;
        case 'error':
            statusMessageElement.classList.add('bg-red-100', 'text-red-800');
            break;
        case 'info':
        default:
            statusMessageElement.classList.add('bg-blue-100', 'text-blue-800');
            break;
    }

    statusMessageElement.textContent = message;
    
    setTimeout(() => {
        statusMessageElement.classList.add('hidden');
    }, 4000); 
};


/**
 * Hides admin buttons after use.
 */
export const hideAdminControls = () => {
    const refs = {
        syncButton: document.getElementById('syncButton'),
        adminClearButton: document.getElementById('adminClearButton'),
        hideAdminButton: document.getElementById('hideAdminButton')
    };
    if (refs.syncButton) refs.syncButton.classList.add('hidden');
    if (refs.adminClearButton) refs.adminClearButton.classList.add('hidden');
    if (refs.hideAdminButton) refs.hideAdminButton.classList.add('hidden');
    log("Admin controls hidden.");
}
