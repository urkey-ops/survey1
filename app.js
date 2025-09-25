// --- Core Application Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const form = document.getElementById('surveyForm');
    const statusMessage = document.getElementById('statusMessage');
    const syncButton = document.getElementById('syncButton');
    const adminClearButton = document.getElementById('adminClearButton');
    const hideAdminButton = document.getElementById('hideAdminButton');
    const mainTitle = document.getElementById('mainTitle');
    const nextButton = document.getElementById('nextButton');
    const backButton = document.getElementById('backButton');
    const buttonContainer = document.getElementById('buttonContainer'); 
    const questionContainer = document.getElementById('questionContainer');
    const surveyContent = document.getElementById('surveyContent');
    const overlay = document.getElementById('overlay');
    const overlayMessage = document.getElementById('overlayMessage');
    const countdownSpan = document.getElementById('countdown');
    const cancelButton = document.getElementById('cancelButton');
    const progressBar = document.getElementById('progressBar');

    // --- Configuration ---
    const DEBUG_MODE = true;
    const log = (message, ...args) => DEBUG_MODE && console.log(`[DEBUG] ${message}`, ...args);

    const config = {
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
    const API_ENDPOINT = '/api/submit-survey'; 
    const LOCAL_STORAGE_KEY = 'surveySubmissions';

    // --- Survey Questions Data: ALL REQUIRED: TRUE ---
    const surveyQuestions = [
        {
            id: 'comments',
            name: 'comments',
            type: 'textarea',
            question: '1. What did you like about your visit today?',
            placeholder: 'Type your comments here...',
            required: true, // COMPULSORY
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
            required: true // COMPULSORY
        },
        {
            id: 'cleanliness',
            name: 'cleanliness',
            type: 'number-scale',
            question: '3. How would you rate the cleanliness of the facility?',
            min: 1,
            max: 5,
            labels: { min: '1 (Poor)', max: '5 (Excellent)' },
            required: true // COMPULSORY
        },
        {
            id: 'staff_friendliness',
            name: 'staff_friendliness',
            type: 'star-rating',
            question: '4. How friendly was the volunteer staff?',
            min: 1,
            max: 5,
            required: true // COMPULSORY
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
            required: true // **CHANGED to COMPULSORY**
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
            required: true // **CHANGED to COMPULSORY**
        },
        {
            id: 'contact',
            name: 'contact',
            type: 'custom-contact',
            question: 'Help us stay in touch.',
            // NOTE: The contact question's *main* field is now required.
            // Internal fields (name/email) are conditionally validated inside validatePage().
            required: true // **CHANGED to COMPULSORY**
        }
    ];

    // --- Application State ---
    const appState = {
        currentPage: 0,
        formData: {},
        questionRotationIndex: 0,
        typingTimeout: null,
        displayTimeout: null,
        inactivityTimeout: null,
        countdownIntervalId: null,
        isUserActive: false,
        adminClickCount: 0,
        adminTimer: null,
        stopRotationPermanently: false,
        syncIntervalId: null,
    };

    // --- Helper Functions (omitted for brevity, assume unchanged) ---
    const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const updateProgressBar = (isSubmitted = false) => {
        let progress = (appState.currentPage / surveyQuestions.length) * 100;
        if (isSubmitted) {
            progress = 100; 
        }
        progressBar.style.width = `${progress}%`;
    };

    const showTemporaryMessage = (message, type = 'info') => {
        const className = type === 'error' ? 'bg-red-100 text-red-700' : (type === 'success' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700');
        statusMessage.textContent = message;
        statusMessage.className = `block p-4 mb-4 rounded-xl text-center font-medium ${className}`;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    };

    // --- INACTIVITY & AUTO-SUBMISSION LOGIC (omitted for brevity, assume unchanged) ---
    const resetInactivityTimer = () => {
        clearTimeout(appState.inactivityTimeout);
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
            overlay.classList.add('invisible', 'opacity-0');
            overlay.classList.remove('flex', 'opacity-100'); 
        }
        appState.inactivityTimeout = setTimeout(handleInactivityTimeout, config.inactivityTime);
        appState.isUserActive = true; 
    };

    const handleInactivityTimeout = () => {
        log("Inactivity timer expired.");
        
        const firstQuestionName = surveyQuestions[0].name; 
        
        if (appState.formData[firstQuestionName] && appState.formData[firstQuestionName].trim() !== '') {
            log("User inactive with partial data (Q1 answered). Triggering auto-submit countdown.");
            autoSubmitSurvey();
        } else {
            log("User inactive on first page with no required data. Resetting survey.");
            resetSurvey();
        }
    };

    const autoSubmitSurvey = () => {
        log("Auto-submit triggered. Starting countdown.");
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
        }

        overlay.classList.remove('invisible', 'opacity-0');
        overlay.classList.add('flex', 'opacity-100');
        
        let countdown = config.autoSubmitCountdown;
        countdownSpan.textContent = countdown;

        appState.countdownIntervalId = setInterval(() => {
            countdown--;
            countdownSpan.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(appState.countdownIntervalId);
                log("Auto-submitting incomplete survey.");
                const submission = {
                    id: uuidv4(),
                    timestamp: new Date().toISOString(),
                    data: appState.formData,
                    is_incomplete: true
                };
                storeSubmission(submission);
                resetSurvey(); 
                syncData();
            }
        }, 1000);
    };

    // --- Question Rotation Logic (omitted for brevity, assume unchanged) ---
    const startQuestionRotation = () => {
        if (appState.currentPage !== 0 || appState.stopRotationPermanently) return;
        // Logic to rotate first question's text
    };

    const stopQuestionRotation = () => {
        // Logic to clear rotation timers
    };

    const typeWriter = (text, i) => { /* ... */ };
    const rotateQuestions = () => { /* ... */ };


    // --- Modular Question Rendering & Event Handling (omitted for brevity, assume unchanged) ---
    // Includes renderers for 'textarea', 'emoji-radio', 'number-scale', 'star-rating', 'radio-with-other', 'radio', 'custom-contact'
    const questionRenderers = { /* ... */ };

    // --- Survey Page Logic ---
    const renderPage = (pageIndex) => {
        const questionData = surveyQuestions[pageIndex];
        if (!questionData) return;

        const renderer = questionRenderers[questionData.type];
        if (!renderer) {
            questionContainer.innerHTML = `<p class="text-red-500">Error: Question type "${questionData.type}" not found.</p>`;
            return;
        }

        questionContainer.innerHTML = renderer.render(questionData, appState.formData);
        updateProgressBar();

        // General and specific event listeners
        const allInputs = questionContainer.querySelectorAll('input, textarea');
        allInputs.forEach(input => {
            input.addEventListener('input', resetInactivityTimer);
            input.addEventListener('change', resetInactivityTimer);
        });

        renderer.setupEvents(questionData, { handleNextQuestion });

        const firstInput = questionContainer.querySelector('input:not([type="hidden"]), textarea');
        if (firstInput) {
            firstInput.focus();
        }

        // Handle page-specific UI states: Visibility is managed here, *not* display
        if (pageIndex === 0) {
            backButton.style.visibility = 'hidden';
            startQuestionRotation(); 
        } else {
            backButton.style.visibility = 'visible';
            stopQuestionRotation(); 
        }

        nextButton.textContent = (pageIndex === surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
    };

    // --- Validation Logic (Logic remains correct for required: true) ---
    const clearValidationErrors = () => { /* ... */ };
    const showValidationError = (fieldId, message) => { /* ... */ };

    const validatePage = () => {
        clearValidationErrors();
        const questionData = surveyQuestions[appState.currentPage];
        let isValid = true;

        const currentData = Object.fromEntries(new FormData(form));
        Object.assign(appState.formData, currentData);
        log("Updated appState.formData:", appState.formData);

        const value = appState.formData[questionData.name];

        // 1. Main Required Field Check (Now applied to all pages)
        if (questionData.required) {
            if (!value || (typeof value === 'string' && value.trim() === '')) {
                isValid = false;
                showValidationError(questionData.id, "This field is required.");
            }
        }

        // 2. Specific Validation: Location "Other" text field
        if (questionData.type === 'radio-with-other' && value === 'Other' && !appState.formData.other_location?.trim()) {
            isValid = false;
            showValidationError('other_location_text', "Please specify your location.");
        }

        // 3. Specific Validation: Contact Email
        if (questionData.type === 'custom-contact' && appState.formData.newsletterConsent === 'Yes') {
            const email = appState.formData.email?.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
                isValid = false;
                showValidationError('email', "Please enter a valid email address.");
            }
        }
        // Note: For custom-contact, since required is true, the user must interact with *some* field
        // or the primary validation (1) will catch it if it was a radio/select. Since it's a custom layout, 
        // the form submission itself captures the state, which then runs validation 2 and 3.

        return isValid;
    };

    // --- Navigation and Submission (omitted for brevity, assume unchanged) ---
    const handleNextQuestion = async () => { /* ... */ };
    const submitSurvey = async () => { /* ... */ };

    // --- Data Storage and API Communication (omitted for brevity, assume unchanged) ---
    const getStoredSubmissions = () => { /* ... */ };
    const storeSubmission = (submission) => { /* ... */ };
    const removeSyncedSubmissions = (syncedIds) => { /* ... */ };
    const syncData = async () => { /* ... */ };

    // --- UI State Management (Cleaned Visibility Logic) ---
    const toggleUI = (enable) => {
        const isSubmitButton = appState.currentPage === surveyQuestions.length - 1;
        
        nextButton.disabled = !enable;
        nextButton.innerHTML = enable ? (isSubmitButton ? 'Submit Survey' : 'Next') : `<div class="spinner"></div>`;
        backButton.disabled = !enable;

        surveyContent.classList.toggle('pointer-events-none', !enable);
        surveyContent.classList.toggle('opacity-50', !enable);
    };

    const showCompletionScreen = () => {
        // Hide the overlay if it was shown for auto-submit
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        overlay.classList.remove('flex', 'opacity-100');
        overlay.classList.add('invisible', 'opacity-0');

        updateProgressBar(true); 

        questionContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full checkmark-container min-h-[300px]">
                <div class="flex items-center justify-center w-24 h-24 rounded-full checkmark-circle">
                    <div class="text-white text-6xl checkmark-icon">✓</div>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Thank You!</h2>
                <p class="text-gray-600 mt-2">Your feedback has been saved.</p>
            </div>`;
        
        nextButton.disabled = true;
        backButton.disabled = true;

        setTimeout(resetSurvey, config.resetTime);
    };

    const resetSurvey = () => {
        appState.currentPage = 0;
        appState.formData = {};
        appState.isUserActive = false;
        appState.stopRotationPermanently = false;

        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        overlay.classList.remove('flex', 'opacity-100');
        overlay.classList.add('invisible', 'opacity-0');

        form.reset();
        
        nextButton.disabled = false;
        backButton.disabled = false;
        
        renderPage(appState.currentPage);
        toggleUI(true);
    };

    // --- Admin Control Logic and Event Handlers (omitted for brevity, assume unchanged) ---
    const hideAdminControls = () => { /* ... */ };
    nextButton.addEventListener('click', (e) => { /* ... */ });
    backButton.addEventListener('click', (e) => { /* ... */ });
    mainTitle.addEventListener('click', () => { /* ... */ });
    cancelButton.addEventListener('click', () => { /* ... */ });
    syncButton.addEventListener('click', async () => { /* ... */ });
    adminClearButton.addEventListener('click', () => { /* ... */ });
    hideAdminButton.addEventListener('click', hideAdminControls);

    // Initial render and setup
    renderPage(appState.currentPage);
    resetInactivityTimer();

    // Start a periodic sync check (Working Version 3 logic retained)
    appState.syncIntervalId = setInterval(syncData, 900000); 
});
