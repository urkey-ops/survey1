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

// --- Configuration Constants (Assumed to be defined in HTML) ---
const DOM_ELEMENTS = {
    form: 'surveyForm',
    statusMessage: 'statusMessage',
    syncButton: 'syncButton',
    adminClearButton: 'adminClearButton',
    hideAdminButton: 'hideAdminButton',
    mainTitle: 'mainTitle',
    nextButton: 'nextButton',
    backButton: 'backButton',
    questionContainer: 'questionContainer',
    surveyContent: 'surveyContent',
    overlay: 'overlay',
    countdownSpan: 'countdown',
    cancelButton: 'cancelButton',
    progressBar: 'progressBar'
};

document.addEventListener('DOMContentLoaded', () => {
    const refs = {};
    for (const key in DOM_ELEMENTS) {
        refs[key] = document.getElementById(DOM_ELEMENTS[key]);
        if (!refs[key]) {
            console.error(`DOM element missing: #${DOM_ELEMENTS[key]}`);
        }
    }
    
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

    // --- Helper Functions (UI-related) ---
    const updateProgressBar = (isSubmitted = false) => {
        let progress = (appState.currentPage / surveyQuestions.length) * 100;
        if (isSubmitted) {
            progress = 100; 
        }
        if (refs.progressBar) {
            refs.progressBar.style.width = `${progress}%`;
        }
    };

    const toggleUI = (enable) => {
        // Placeholder for enabling/disabling UI elements
        const elements = [refs.nextButton, refs.backButton];
        elements.forEach(el => {
            if (el) el.disabled = !enable;
        });
    };
    
    const showCompletionScreen = () => {
        // Placeholder for displaying the thank you/completion screen
        if (refs.surveyContent) {
            refs.surveyContent.innerHTML = `
                <div class="p-8 text-center">
                    <h2 class="text-3xl font-bold text-gray-800 mb-4">Thank You!</h2>
                    <p class="text-lg text-gray-600">Your feedback has been submitted successfully.</p>
                </div>
            `;
            updateProgressBar(true);
        }
    };
    
    const resetSurvey = () => {
        // Clear state, clear form, go back to page 0
        appState.currentPage = 0;
        appState.formData = {};
        appState.isUserActive = false;
        
        // Hide overlay if visible
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        if (refs.overlay) {
            refs.overlay.classList.add('invisible', 'opacity-0');
            refs.overlay.classList.remove('flex', 'opacity-100');
        }

        renderPage(appState.currentPage);
        updateProgressBar();
        resetInactivityTimer();
    };

    // --- INACTIVITY & AUTO-SUBMISSION LOGIC ---
    const resetInactivityTimer = () => {
        clearTimeout(appState.inactivityTimeout);
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
            if (refs.overlay) {
                refs.overlay.classList.add('invisible', 'opacity-0');
                refs.overlay.classList.remove('flex', 'opacity-100');
            }
        }
        appState.inactivityTimeout = setTimeout(handleInactivityTimeout, config.inactivityTime);
        appState.isUserActive = true; 
    };

    // --- START OF THE FIX ---
    const handleInactivityTimeout = () => {
        log("Inactivity timer expired.");

        // Check if surveyQuestions is available to prevent crashes if data-util failed to load
        if (surveyQuestions.length === 0) {
             log("No survey questions loaded. Cannot proceed or reset.");
             return;
        }
        
        const firstQuestionName = surveyQuestions[0].name;

        // Check if the user is past Q1 OR if Q1 has been partially answered.
        // The check appState.currentPage > 0 prevents immediate reset on a blank Q1 page.
        if (appState.currentPage > 0 || (appState.formData[firstQuestionName] && appState.formData[firstQuestionName].trim() !== '')) {
            log("User inactive with partial progress. Triggering auto-submit countdown.");
            autoSubmitSurvey();
        } else {
            // User is on Page 0 and Q1 is blank. This is the intended reset state for an idle kiosk.
            log("User inactive on first page with no required data. Resetting survey.");
            resetSurvey();
        }
    };
    // --- END OF THE FIX ---

    const autoSubmitSurvey = () => {
        log("Auto-submit triggered. Starting countdown.");
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
        }

        if (refs.overlay) {
            refs.overlay.classList.remove('invisible', 'opacity-0');
            refs.overlay.classList.add('flex', 'opacity-100');
        }
        
        let countdown = config.autoSubmitCountdown;
        if (refs.countdownSpan) {
            refs.countdownSpan.textContent = countdown;
        }

        appState.countdownIntervalId = setInterval(() => {
            countdown--;
            if (refs.countdownSpan) {
                refs.countdownSpan.textContent = countdown;
            }
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
                resetSurvey();  // Resets UI
                syncData(); // Initiates sync
            }
        }, 1000);
    };

    // --- Question Rotation Logic (Placeholder) ---
    const startQuestionRotation = () => { /* ... rotation logic remains here ... */ };
    const stopQuestionRotation = () => { /* ... rotation logic remains here ... */ };
    const typeWriter = (text, i) => { /* ... rotation logic remains here ... */ };
    const rotateQuestions = () => { /* ... rotation logic remains here ... */ };

    // --- Survey Page Logic (CRITICAL for Q1 visibility) ---
    const questionRenderers = {
        // Placeholder for renderers (assuming they exist in the original file)
        'textarea': {
             render: (q, data) => `
                <label for="${q.id}" class="text-xl font-semibold mb-4 block">${q.question}</label>
                <textarea id="${q.id}" name="${q.name}" placeholder="${q.placeholder || ''}" 
                          class="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 h-32"></textarea>
             `,
             setupEvents: (q) => { /* ... */ }
        },
        'emoji-radio': {
             render: (q, data) => {
                 return `
                    <p class="text-xl font-semibold mb-4">${q.question}</p>
                    <div class="flex justify-around space-x-4">
                        ${q.options.map(opt => `
                            <label class="flex flex-col items-center cursor-pointer p-4 rounded-xl transition hover:bg-gray-100">
                                <input type="radio" name="${q.name}" value="${opt.value}" class="hidden" />
                                <span class="text-5xl mb-2">${opt.emoji}</span>
                                <span class="text-sm font-medium">${opt.label}</span>
                            </label>
                        `).join('')}
                    </div>
                 `;
             },
             setupEvents: (q, { handleNextQuestion }) => {
                 document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                     radio.addEventListener('change', handleNextQuestion);
                     radio.addEventListener('change', resetInactivityTimer); // Ensure activity resets on input
                 });
             }
        },
        // ... all other renderers ...
    };

    const renderPage = (pageIndex) => {
        if (surveyQuestions.length === 0 || pageIndex >= surveyQuestions.length) {
            log("Cannot render page: invalid index or no questions loaded.");
            return;
        }

        const question = surveyQuestions[pageIndex];
        const renderer = questionRenderers[question.type];
        
        if (refs.questionContainer && renderer) {
            // Render the question HTML
            refs.questionContainer.innerHTML = renderer.render(question, appState.formData[question.name]);
            
            // Set up event listeners (e.g., for radio buttons, inputs)
            renderer.setupEvents(question, { handleNextQuestion, resetInactivityTimer });

            // Set current value from formData if available
            const inputElement = refs.questionContainer.querySelector(`[name="${question.name}"]`);
            if (inputElement && appState.formData[question.name]) {
                inputElement.value = appState.formData[question.name];
            }
        }
        
        updateProgressBar();

        // Update navigation visibility
        if (refs.backButton) refs.backButton.classList.toggle('invisible', pageIndex === 0);
        if (refs.nextButton) refs.nextButton.classList.toggle('invisible', pageIndex === surveyQuestions.length - 1);
    };

    // --- Validation Logic (Placeholder) ---
    const clearValidationErrors = () => { /* ... */ };
    const showValidationError = (fieldId, message) => { /* ... */ };
    const validatePage = () => { return true; /* Always pass for now */ };

    // --- Navigation and Submission ---
    const handleNextQuestion = async () => {
        resetInactivityTimer(); // User is active
        if (!validatePage()) return;
        toggleUI(false);

        // Save current page data (simple text/value save assumed)
        const currentQuestion = surveyQuestions[appState.currentPage];
        const inputElement = refs.questionContainer.querySelector(`[name="${currentQuestion.name}"]`);
        if (inputElement) {
            appState.formData[currentQuestion.name] = inputElement.value;
        }

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
            id: uuidv4(), 
            timestamp: new Date().toISOString(),
            data: appState.formData
        };
        log("Submitting survey (complete).", submission); 
        storeSubmission(submission); 
        showCompletionScreen();
        await syncData();
        // The resetSurvey will happen after the completion screen timeout
    };

    // --- Admin Control Logic and Event Handlers ---
    if (refs.nextButton) refs.nextButton.addEventListener('click', (e) => {
        e.preventDefault();
        handleNextQuestion();
    });

    if (refs.backButton) refs.backButton.addEventListener('click', (e) => {
        e.preventDefault();
        resetInactivityTimer(); // User is active
        if (appState.currentPage > 0) {
            appState.currentPage--;
            renderPage(appState.currentPage);
        }
    });

    // Admin Mode Activation Logic
    if (refs.mainTitle) refs.mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        clearTimeout(appState.adminTimer);
        appState.adminTimer = setTimeout(() => appState.adminClickCount = 0, config.adminClickTimeout); 

        if (appState.adminClickCount === config.adminClicksRequired) { 
            log("Admin mode activated!");
            showTemporaryMessage("Admin mode activated."); 
            if (refs.syncButton) refs.syncButton.classList.remove('hidden');
            if (refs.adminClearButton) refs.adminClearButton.classList.remove('hidden');
            if (refs.hideAdminButton) refs.hideAdminButton.classList.remove('hidden');
            appState.adminClickCount = 0;
        }
    });

    if (refs.cancelButton) refs.cancelButton.addEventListener('click', () => {
         // Stop auto-submit and reset timer on cancel
         resetInactivityTimer(); 
    });

    if (refs.syncButton) refs.syncButton.addEventListener('click', async () => {
        await syncData(); 
    });
    
    if (refs.adminClearButton) refs.adminClearButton.addEventListener('click', () => {
        // IMPORTANT: Custom modal should replace native confirm()
        if(confirm("Are you sure you want to clear all local submissions? This cannot be undone.")) {
            localStorage.removeItem('surveySubmissions');
            showTemporaryMessage("All local submissions cleared.", "success"); 
        }
    });

    if (refs.hideAdminButton) refs.hideAdminButton.addEventListener('click', hideAdminControls); 
    
    // Global activity listeners for inactivity reset
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keypress', resetInactivityTimer);
    document.addEventListener('touchstart', resetInactivityTimer);
    

    // Initial render and setup
    renderPage(appState.currentPage);
    resetInactivityTimer();

    // Start a periodic sync check (15 minutes = 900000 ms)
    appState.syncIntervalId = setInterval(syncData, 900000); 
});
