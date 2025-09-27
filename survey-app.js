// survey-app.js

import { 
    log, 
    uuidv4, 
    config, 
    surveyQuestions, 
    storeSubmission, 
    syncData, 
    showTemporaryMessage,
    hideAdminControls 
} from './data-util.js'; 

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const form = document.getElementById('surveyForm');
    const statusMessage = document.getElementById('statusMessage'); // Already handled in data-util, keep ref for clarity
    const syncButton = document.getElementById('syncButton');
    const adminClearButton = document.getElementById('adminClearButton');
    const hideAdminButton = document.getElementById('hideAdminButton');
    const mainTitle = document.getElementById('mainTitle');
    const nextButton = document.getElementById('nextButton');
    const backButton = document.getElementById('backButton');
    const questionContainer = document.getElementById('questionContainer');
    const surveyContent = document.getElementById('surveyContent');
    const overlay = document.getElementById('overlay');
    const countdownSpan = document.getElementById('countdown');
    const cancelButton = document.getElementById('cancelButton');
    const progressBar = document.getElementById('progressBar');

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

    // --- Helper Functions (Only UI related ones remain) ---
    const updateProgressBar = (isSubmitted = false) => {
        let progress = (appState.currentPage / surveyQuestions.length) * 100;
        if (isSubmitted) {
            progress = 100; 
        }
        progressBar.style.width = `${progress}%`;
    };

    // --- INACTIVITY & AUTO-SUBMISSION LOGIC ---
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
        // ... (countdown timer and overlay logic remains here, using imported config) ...
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
                    id: uuidv4(), // Imported
                    timestamp: new Date().toISOString(),
                    data: appState.formData,
                    is_incomplete: true
                };
                storeSubmission(submission); // Imported
                resetSurvey(); 
                syncData(); // Imported
            }
        }, 1000);
    };

    // --- Question Rotation Logic ---
    const startQuestionRotation = () => { /* ... rotation logic remains here ... */ };
    const stopQuestionRotation = () => { /* ... rotation logic remains here ... */ };
    const typeWriter = (text, i) => { /* ... rotation logic remains here ... */ };
    const rotateQuestions = () => { /* ... rotation logic remains here ... */ };

    // --- Modular Question Rendering & Event Handling ---
    const questionRenderers = {
        // ... all question renderer objects remain here ... (too verbose to fully include)
        'textarea': {
             render: (q, data) => `...`,
             setupEvents: (q) => { /* ... */ }
        },
        'emoji-radio': {
            render: (q, data) => `...`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => radio.addEventListener('change', handleNextQuestion));
            }
        },
        // ... all other renderers ...
    };

    // --- Survey Page Logic ---
    const renderPage = (pageIndex) => {
        // ... rendering logic remains here, using imported surveyQuestions ...
    };

    // --- Validation Logic ---
    const clearValidationErrors = () => { /* ... */ };
    const showValidationError = (fieldId, message) => { /* ... */ };
    const validatePage = () => { /* ... validation logic remains here ... */ };

    // --- Navigation and Submission ---
    const handleNextQuestion = async () => {
        if (!validatePage()) return;
        toggleUI(false);
        if (appState.currentPage < surveyQuestions.length - 1) {
            appState.currentPage++;
            renderPage(appState.currentPage);
            toggleUI(true);
        } else {
            await submitSurvey();
        }
    };

    const submitSurvey = async () => {
        const submission = {
            id: uuidv4(), // Imported
            timestamp: new Date().toISOString(),
            data: appState.formData
        };
        log("Submitting survey (complete).", submission); // Imported
        storeSubmission(submission); // Imported
        showCompletionScreen();
        await syncData(); // Imported
    };

    // --- UI State Management ---
    const toggleUI = (enable) => { /* ... */ };
    const showCompletionScreen = () => { /* ... */ };

    const resetSurvey = () => {
        // ... reset logic remains here, using imported config ...
    };

    // --- Admin Control Logic and Event Handlers ---
    nextButton.addEventListener('click', (e) => {
        e.preventDefault();
        handleNextQuestion();
    });

    backButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (appState.currentPage > 0) {
            appState.currentPage--;
            renderPage(appState.currentPage);
        }
    });

    // Admin Mode Activation Logic
    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        clearTimeout(appState.adminTimer);
        appState.adminTimer = setTimeout(() => appState.adminClickCount = 0, config.adminClickTimeout); // Imported config

        if (appState.adminClickCount === config.adminClicksRequired) { // Imported config
            log("Admin mode activated!");
            showTemporaryMessage("Admin mode activated."); // Imported
            syncButton.classList.remove('hidden');
            adminClearButton.classList.remove('hidden');
            hideAdminButton.classList.remove('hidden');
            appState.adminClickCount = 0;
        }
    });

    cancelButton.addEventListener('click', () => {
        // ... cancel logic ...
    });

    syncButton.addEventListener('click', async () => {
        await syncData(); // Imported
    });
    
    adminClearButton.addEventListener('click', () => {
        if(confirm("Are you sure you want to clear all local submissions? This cannot be undone.")) {
            localStorage.removeItem('surveySubmissions');
            showTemporaryMessage("All local submissions cleared.", "success"); // Imported
        }
    });

    hideAdminButton.addEventListener('click', hideAdminControls); // Imported

    // Initial render and setup
    renderPage(appState.currentPage);
    resetInactivityTimer();

    // Start a periodic sync check (15 minutes)
    appState.syncIntervalId = setInterval(syncData, 900000); // Imported syncData
});

//
