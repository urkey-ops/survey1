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

    const API_ENDPOINT = '/api/submit-survey';
    const LOCAL_STORAGE_KEY = 'surveySubmissions';

    // --- Survey Questions Data ---
    const surveyQuestions = [
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
            required: false
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
            required: false
        },
        {
            id: 'contact',
            name: 'contact',
            type: 'custom-contact',
            question: 'Help us stay in touch.',
            required: false,
            fields: [
                { id: 'name', name: 'name', label: 'Name', type: 'text', placeholder: 'Enter your name' },
                { id: 'newsletterConsent', name: 'newsletterConsent', label: 'Yes, I want to subscribe to updates', type: 'checkbox', placeholder: '' },
                { id: 'email', name: 'email', label: 'Email', type: 'email', placeholder: 'Enter your email' }
            ]
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

    // --- Helper Functions ---
    const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const debounce = (func, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    };

    const updateProgressBar = (isSubmitted = false) => {
        // Correct calculation for linear progression
        let progress = (appState.currentPage / surveyQuestions.length) * 100;
        if (isSubmitted) {
            progress = 100; // Set to 100% on successful submission
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

    // --- INACTIVITY & AUTO-SUBMISSION LOGIC ---
    const resetInactivityTimer = () => {
        clearTimeout(appState.inactivityTimeout);
        // Clear the countdown overlay and timer if a user becomes active again
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
            overlay.classList.add('invisible', 'opacity-0');
            overlay.classList.remove('flex', 'opacity-100'); // Ensure it hides completely
        }
        appState.inactivityTimeout = setTimeout(handleInactivityTimeout, config.inactivityTime);
        appState.isUserActive = true; // Mark user as active
        // REMOVED: stopQuestionRotation() call for Q1. Rotation must continue.
    };

    const handleInactivityTimeout = () => {
        log("Inactivity timer expired.");
        
        // CUSTOM LOGIC: Only auto-submit/sync if the first required question has been answered.
        const firstQuestionName = surveyQuestions[0].name; // 'comments'
        
        if (appState.formData[firstQuestionName] && appState.formData[firstQuestionName].trim() !== '') {
            log("User inactive with partial data (Q1 answered). Triggering auto-submit countdown.");
            autoSubmitSurvey();
        } else {
            log("User inactive on first page with no required data. Resetting survey.");
            resetSurvey();
        }
    };

    // --- Question Rotation Logic (Modified to run continuously) ---
    const startQuestionRotation = () => {
        if (appState.currentPage !== 0 || appState.stopRotationPermanently) return;
        rotateQuestions();
    };

    const stopQuestionRotation = () => {
        clearTimeout(appState.typingTimeout);
        clearTimeout(appState.displayTimeout);
    };

    const typeWriter = (text, i) => {
        const questionElement = questionContainer.querySelector('#rotatingQuestion');
        if (!questionElement) return;

        if (i < text.length) {
            questionElement.textContent += text.charAt(i);
            appState.typingTimeout = setTimeout(() => typeWriter(text, i + 1), config.rotationSpeed);
        } else {
            // ALWAYS schedule the next rotation, regardless of user activity
            appState.displayTimeout = setTimeout(rotateQuestions, config.rotationDisplayTime);
        }
    };

    const rotateQuestions = () => {
        if (appState.stopRotationPermanently || appState.currentPage !== 0) return;
        const rotatingQuestionEl = questionContainer.querySelector('#rotatingQuestion');
        if (!rotatingQuestionEl) return;
        stopQuestionRotation();

        const questionData = surveyQuestions[0];
        const currentQuestion = questionData.rotatingText[appState.questionRotationIndex];
        rotatingQuestionEl.textContent = "";
        appState.questionRotationIndex = (appState.questionRotationIndex + 1) % questionData.rotatingText.length;
        typeWriter(currentQuestion, 0);
    };

    // --- Modular Question Rendering & Event Handling ---
    const questionRenderers = {
        'textarea': {
            render: (q, data) => `
                <label id="rotatingQuestion" for="${q.id}" class="block text-gray-700 font-semibold mb-2" aria-live="polite">${q.question}</label>
                <textarea id="${q.id}" name="${q.name}" rows="4" class="shadow-sm resize-none appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="${q.placeholder}" required>${data[q.name] || ''}</textarea>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: (q) => {
                const textarea = document.getElementById(q.id);
                // REMOVED: Rotation stopping/starting on focus/blur events to allow continuous rotation
            }
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
        'number-scale': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="number-scale-group grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${Array.from({ length: q.max }, (_, i) => i + 1).map(num => `
                        <input type="radio" id="${q.id + num}" name="${q.name}" value="${num}" class="visually-hidden" ${parseInt(data[q.name]) === num ? 'checked' : ''}>
                        <label for="${q.id + num}" class="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-white border-2 border-transparent rounded-full font-bold text-gray-700 hover:bg-gray-50"><span>${num}</span></label>
                    `).join('')}
                </div>
                <div class="flex justify-between text-sm mt-2 text-gray-500"><span>${q.labels.min}</span><span>${q.labels.max}</span></div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => radio.addEventListener('change', handleNextQuestion));
            }
        },
        'star-rating': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="star-rating flex flex-row-reverse justify-center mt-2" role="radiogroup" aria-labelledby="${q.id}Label">
                        ${Array.from({ length: q.max }, (_, i) => q.max - i).map(num => `
                            <input type="radio" id="${q.id + num}" name="${q.name}" value="${num}" class="visually-hidden" ${parseInt(data[q.name]) === num ? 'checked' : ''}>
                            <label for="${q.id + num}" class="star text-4xl sm:text-5xl pr-1 cursor-pointer">★</label>
                        `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => radio.addEventListener('change', handleNextQuestion));
            }
        },
        'radio-with-other': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="location-radio-group grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${q.options.map(opt => `
                        <input type="radio" id="${q.id + opt.value}" name="${q.name}" value="${opt.value}" class="visually-hidden" ${data[q.name] === opt.value ? 'checked' : ''}>
                        <label for="${q.id + opt.value}" class="px-3 py-3 text-center text-sm sm:text-base font-medium border-2 border-gray-300 rounded-lg">${opt.label}</label>
                    `).join('')}
                </div>
                <div id="other-location-container" class="mt-4 ${data[q.name] === 'Other' ? '' : 'hidden'}">
                    <input type="text" id="other_location_text" name="other_location" class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" placeholder="Please specify" value="${data['other_location'] || ''}">
                    <span id="other_location_textError" class="error-message hidden mt-1"></span>
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                    radio.addEventListener('change', (e) => {
                        const otherContainer = document.getElementById('other-location-container');
                        if (e.target.value === 'Other') {
                            otherContainer.classList.remove('hidden');
                        } else {
                            otherContainer.classList.add('hidden');
                            // Clear 'other_location' from formData and input if a main option is selected
                            const otherInput = otherContainer.querySelector('input');
                            if (otherInput) otherInput.value = '';
                            delete appState.formData['other_location'];

                            handleNextQuestion();
                        }
                    });
                });
            }
        },
        'radio': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${q.options.map(opt => `
                        <input type="radio" id="${q.id + opt.value}" name="${q.name}" value="${opt.value}" class="visually-hidden" ${data[q.name] === opt.value ? 'checked' : ''}>
                        <label for="${q.id + opt.value}" class="px-3 py-3 text-center text-sm sm:text-base font-medium border-2 border-gray-300 rounded-lg">${opt.label}</label>
                    `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => radio.addEventListener('change', handleNextQuestion));
            }
        },
        'custom-contact': {
            render: (q, data) => {
                const isChecked = data['newsletterConsent'] === 'Yes';
                return `
                <div class="space-y-4">
                    <div>
                        <label for="name" class="block text-gray-700 font-semibold mb-2">Name</label>
                        <input type="text" id="name" name="name" class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" placeholder="Enter your name" value="${data['name'] || ''}">
                        <span id="nameError" class="error-message hidden"></span>
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" id="newsletterConsent" name="newsletterConsent" value="Yes" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" ${isChecked ? 'checked' : ''}>
                        <label for="newsletterConsent" class="ml-2 block text-gray-700">Yes, I want to subscribe to updates</label>
                    </div>
                    <div id="email-field-container" class="${isChecked ? 'visible-fields' : 'hidden-fields'}">
                        <label for="email" class="block text-gray-700 font-semibold mb-2">Email</label>
                        <input type="email" id="email" name="email" class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" placeholder="Enter your email" value="${data['email'] || ''}">
                        <span id="emailError" class="error-message hidden"></span>
                    </div>
                </div>`;
            },
            setupEvents: () => {
                const checkbox = document.getElementById('newsletterConsent');
                checkbox.addEventListener('change', (e) => {
                    const emailContainer = document.getElementById('email-field-container');
                    const emailInput = document.getElementById('email');
                    if (e.target.checked) {
                        emailContainer.classList.remove('hidden-fields');
                        emailContainer.classList.add('visible-fields');
                        emailInput.required = true;
                    } else {
                        emailContainer.classList.remove('visible-fields');
                        emailContainer.classList.add('hidden-fields');
                        emailInput.required = false;
                        emailInput.value = '';
                        delete appState.formData['email'];
                    }
                });
            }
        }
    };

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

        // Auto-focus on the first interactive element for better a11y and UX
        const firstInput = questionContainer.querySelector('input:not([type="hidden"]), textarea');
        if (firstInput) {
            firstInput.focus();
        }

        // Handle page-specific UI states
        if (pageIndex === 0) {
            backButton.style.visibility = 'hidden';
            // Start rotation continuously on page 0
            startQuestionRotation(); 
        } else {
            backButton.style.visibility = 'visible';
            stopQuestionRotation(); // Stop rotation on other pages
        }

        nextButton.textContent = (pageIndex === surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
    };

    // --- Validation Logic (Unchanged) ---
    const clearValidationErrors = () => {
        questionContainer.querySelectorAll('.error-message').forEach(span => span.classList.add('hidden'));
        questionContainer.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
    };

    const showValidationError = (fieldId, message) => {
        const errorSpan = document.getElementById(`${fieldId}Error`);
        const fieldInput = document.getElementById(fieldId) || questionContainer.querySelector(`[name="${fieldId}"]`);
        if (errorSpan) {
            errorSpan.textContent = message;
            errorSpan.classList.remove('hidden');
        }
        if (fieldInput) {
            fieldInput.closest('.emoji-radio-group, .number-scale-group, .star-rating')?.classList.add('has-error');
            fieldInput.classList.add('has-error');
        }
    };

    const validatePage = () => {
        clearValidationErrors();
        const questionData = surveyQuestions[appState.currentPage];
        let isValid = true;

        // Update formData from the current page's form elements
        const currentData = Object.fromEntries(new FormData(form));
        Object.assign(appState.formData, currentData);
        log("Updated appState.formData:", appState.formData);

        if (questionData.required && (!appState.formData[questionData.name] || appState.formData[questionData.name].trim() === '')) {
            isValid = false;
            showValidationError(questionData.id, "This field is required.");
        }

        if (questionData.type === 'radio-with-other' && appState.formData.location === 'Other' && !appState.formData.other_location?.trim()) {
            isValid = false;
            showValidationError('other_location_text', "Please specify your location.");
        }

        if (questionData.type === 'custom-contact' && appState.formData.newsletterConsent === 'Yes') {
            const email = appState.formData.email?.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!email || !emailRegex.test(email)) {
                isValid = false;
                showValidationError('email', "Please enter a valid email address.");
            }
        }

        return isValid;
    };

    // --- Navigation and Submission (Unchanged) ---
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
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            data: appState.formData
        };
        log("Submitting survey (complete).", submission);
        storeSubmission(submission);
        showCompletionScreen();
        await syncData(); // Attempt to sync immediately after completion
    };

    const autoSubmitSurvey = () => {
        log("Auto-submit triggered. Starting countdown.");
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
        }

        // Use flex and remove invisible to show the overlay
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
                // The auto-submit should trigger a simple reset, not show the thank you screen
                resetSurvey(); 
                syncData();
            }
        }, 1000);
    };

    // --- Data Storage and API Communication (Unchanged) ---
    const getStoredSubmissions = () => {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        } catch (e) {
            console.error("Failed to parse submissions from localStorage", e);
            return [];
        }
    };

    const storeSubmission = (submission) => {
        try {
            const submissions = getStoredSubmissions();
            submissions.push(submission);
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
        } catch (e) {
            console.error("Failed to store submission in localStorage:", e);
            showTemporaryMessage("Critical Error: Could not save response locally.", "error");
        }
    };

    const removeSyncedSubmissions = (syncedIds) => {
        const submissions = getStoredSubmissions();
        const remaining = submissions.filter(sub => !syncedIds.includes(sub.id));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
    };

    // --- CONCURRENT SYNC LOGIC (Unchanged) ---
    const syncData = async () => {
        const submissions = getStoredSubmissions();
        if (submissions.length === 0) {
            log("No offline submissions to sync.");
            showTemporaryMessage("All data is synced.", "success");
            return;
        }
        if (!navigator.onLine) {
            showTemporaryMessage('Offline. Sync will resume when online.', 'info');
            return;
        }

        showTemporaryMessage(`Syncing ${submissions.length} submissions...`);

        // Use Promise.all to handle all requests concurrently
        const syncPromises = submissions.map(async (submission) => {
            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(submission),
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return submission.id; // Return the ID on success
            } catch (error) {
                console.error(`Sync failed for submission ID: ${submission.id}. Will retry later.`, error);
                return null; // Return null on failure
            }
        });

        const syncedIds = (await Promise.all(syncPromises)).filter(id => id !== null);

        if (syncedIds.length > 0) {
            removeSyncedSubmissions(syncedIds);
            const remainingCount = submissions.length - syncedIds.length;
            const message = `${syncedIds.length} submission${syncedIds.length !== 1 ? 's' : ''} synced. ${remainingCount > 0 ? `${remainingCount} to go.` : ''}`;
            showTemporaryMessage(message, remainingCount === 0 ? 'success' : 'info');
        } else {
            showTemporaryMessage('Sync failed. Check API or network.', 'error');
        }
    };

    // --- UI State Management (Modified) ---
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

        updateProgressBar(true); // Set progress to 100% on completion

        questionContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full checkmark-container min-h-[300px]">
                <div class="flex items-center justify-center w-24 h-24 rounded-full checkmark-circle">
                    <div class="text-white text-6xl checkmark-icon">✓</div>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Thank You!</h2>
                <p class="text-gray-600 mt-2">Your feedback has been saved.</p>
            </div>`;
        
        // BUG FIX 2: Disable buttons instead of hiding them
        nextButton.disabled = true;
        backButton.disabled = true;

        setTimeout(resetSurvey, config.resetTime);
    };

    const resetSurvey = () => {
        appState.currentPage = 0;
        appState.formData = {};
        appState.isUserActive = false;
        appState.stopRotationPermanently = false;

        // Hide the overlay on every reset
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        overlay.classList.remove('flex', 'opacity-100');
        overlay.classList.add('invisible', 'opacity-0');

        form.reset();
        
        // Restore buttons visibility and state
        nextButton.disabled = false;
        backButton.disabled = false;
        
        renderPage(appState.currentPage);
        toggleUI(true);
    };

    // --- Admin Control Logic (Unchanged) ---
    const hideAdminControls = () => {
        syncButton.classList.add('hidden');
        adminClearButton.classList.add('hidden');
        hideAdminButton.classList.add('hidden');
        showTemporaryMessage("Admin controls hidden.", "info");
    };

    // --- Event Handlers (Unchanged) ---
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

    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        clearTimeout(appState.adminTimer);
        appState.adminTimer = setTimeout(() => appState.adminClickCount = 0, config.adminClickTimeout);

        if (appState.adminClickCount === config.adminClicksRequired) {
            log("Admin mode activated!");
            showTemporaryMessage("Admin mode activated.");
            syncButton.classList.remove('hidden');
            adminClearButton.classList.remove('hidden');
            hideAdminButton.classList.remove('hidden');
            appState.adminClickCount = 0;
        }
    });

    cancelButton.addEventListener('click', () => {
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        overlay.classList.remove('flex', 'opacity-100');
        overlay.classList.add('invisible', 'opacity-0');
        resetInactivityTimer();
    });

    syncButton.addEventListener('click', async () => {
        await syncData();
    });
    
    adminClearButton.addEventListener('click', () => {
        if(confirm("Are you sure you want to clear all local submissions? This cannot be undone.")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            showTemporaryMessage("All local submissions cleared.", "success");
        }
    });

    hideAdminButton.addEventListener('click', hideAdminControls);

    // Initial render and setup
    renderPage(appState.currentPage);
    resetInactivityTimer();

    // Start a periodic sync check: 15 minutes = 900000 milliseconds
    appState.syncIntervalId = setInterval(syncData, 900000); 
});
