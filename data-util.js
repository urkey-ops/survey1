// --- data-util.js ---
// Centralized data, helpers, local storage, sync, and question renderers

// --- Constants ---
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
            { value: '65+', label: '65+' }
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

// --- Sync Helper ---
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
    'textarea': {
        render: (q, data) => `
            <label id="rotatingQuestion" for="${q.id}" class="block text-gray-700 font-semibold mb-2" aria-live="polite">${q.question}</label>
            <textarea id="${q.id}" name="${q.name}" rows="4" class="shadow-sm resize-none appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="${q.placeholder}" required>${data[q.name] || ''}</textarea>
            <span id="${q.id}Error" class="error-message hidden"></span>`,
        setupEvents: (q) => {}
    },
    'emoji-radio': {
        render: (q, data) => `
            <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
            <div class="emoji-radio-group flex justify-around items-center space-x-4" role="radiogroup" aria-labelledby="${q.id}Label">
                ${q.options.map(opt => `
                    <input type="radio" id="${q.id + opt.value}" name="${q.name}" value="${opt.value}" class="visually-hidden" ${data[q.name] === opt.value ? 'checked' : ''}>
                    <label for="${q.id + opt.value}" class="flex flex-col items-center p-4 sm:p-6 bg-white border-2 border-transparent rounded-full hover:bg-gray-50 transition-all duration-300 cursor-pointer">
                        <span class="text-4xl sm:text-5xl mb-2">${opt.emoji}</span>
                        <span class="text-sm font-medium text-gray-600">${opt.label}</span>
                    </label>
                `).join('')}
            </div>
            <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
        setupEvents: (q, { handleNextQuestion }) => {
            document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => radio.addEventListener('change', handleNextQuestion));
        }
    },
    'number-scale': { /* same structure as original */ },
    'star-rating': { /* same structure as original */ },
    'radio-with-other': { /* same structure as original */ },
    'radio': { /* same structure as original */ },
    'custom-contact': { /* same structure as original */ }
};
