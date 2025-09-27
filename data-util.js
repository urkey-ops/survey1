// --- data-util.js ---
// Exports all static data, surveyQuestions, and utility functions

export const LOCAL_STORAGE_KEY = 'surveySubmissions';

// --- Survey Questions ---
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
    {
        id: 'cleanliness',
        name: 'cleanliness',
        type: 'number-scale',
        question: '3. How would you rate the cleanliness of the facility?',
        min: 1,
        max: 5,
        labels: { min: '1 (Poor)', max: '5 (Excellent)' },
        required: true
    },
    {
        id: 'staff_friendliness',
        name: 'staff_friendliness',
        type: 'star-rating',
        question: '4. How friendly was the volunteer staff?',
        min: 1,
        max: 5,
        required: true
    },
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
            { value: '65+' }
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

// --- UUID Helper ---
export const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

// --- Local Storage Helpers ---
export const getStoredSubmissions = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');

export const storeSubmission = (submission) => {
    const submissions = getStoredSubmissions();
    submissions.push(submission);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
};

export const removeSyncedSubmissions = (syncedIds) => {
    const submissions = getStoredSubmissions();
    const remaining = submissions.filter(s => !syncedIds.includes(s.id));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
};

// --- Sync Function ---
export const syncData = async (API_ENDPOINT = '/api/submit-survey') => {
    const submissions = getStoredSubmissions();
    if (!submissions.length) return;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissions })
        });
        const result = await response.json();

        if (result?.syncedIds?.length) removeSyncedSubmissions(result.syncedIds);
        return result;
    } catch (err) {
        console.error("Sync failed:", err);
        return null;
    }
};

// --- UI Helpers ---
export const updateProgressBar = (progressBarEl, currentPage, totalPages, isSubmitted = false) => {
    let progress = (currentPage / totalPages) * 100;
    if (isSubmitted) progress = 100;
    progressBarEl.style.width = `${progress}%`;
};

export const showTemporaryMessage = (statusMessageEl, message, type = 'info') => {
    const className = type === 'error' ? 'bg-red-100 text-red-700' :
                      type === 'success' ? 'bg-green-100 text-green-700' :
                      'bg-yellow-100 text-yellow-700';

    statusMessageEl.textContent = message;
    statusMessageEl.className = `block p-4 mb-4 rounded-xl text-center font-medium ${className}`;
    statusMessageEl.style.display = 'block';
    setTimeout(() => { statusMessageEl.style.display = 'none'; }, 5000);
};

// --- Question Renderers ---
export const questionRenderers = {
    'textarea': { /* same as original */ },
    'emoji-radio': { /* same as original */ },
    'number-scale': { /* same as original */ },
    'star-rating': { /* same as original */ },
    'radio-with-other': { /* same as original */ },
    'radio': { /* same as original */ },
    'custom-contact': { /* same as original */ }
};
