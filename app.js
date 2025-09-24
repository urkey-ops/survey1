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
                { value: '65+', label: '65+' }
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

    const updateProgressBar = () => {
        const progress = (appState.currentPage / (surveyQuestions.length - 1)) * 100;
        progressBar.style.width = `${progress}%`;
    };

    const showTemporaryMessage = (message, type = 'info') => {
        const className = type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
        statusMessage.textContent = message;
        statusMessage.className = `block p-4 mb-4 rounded-xl text-center font-medium ${className}`;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    };
    
    // --- Inactivity and User Activity ---
    const handleUserActivity = () => {
        clearTimeout(appState.inactivityTimeout);
        appState.isUserActive = true;
        appState.stopRotationPermanently = true;

        appState.inactivityTimeout = setTimeout(() => {
            if (appState.currentPage === 0 && Object.keys(appState.formData).length === 0) {
                log("User inactive on first page with no data. Resetting survey.");
                resetSurvey();
            } else {
                log("User inactive. Triggering auto-submit.");
                autoSubmitSurvey();
            }
        }, config.inactivityTime);
    };

    const debouncedHandleActivity = debounce(handleUserActivity, config.debounceDelay);

    // --- Question Rotation Logic ---
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
            if (!appState.isUserActive) {
                appState.displayTimeout = setTimeout(rotateQuestions, config.rotationDisplayTime);
            }
        }
    };

    const rotateQuestions = () => {
        if (appState.stopRotationPermanently) return;
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
            setupEvents: (q, handlers) => {
                const textarea = document.getElementById(q.id);
                textarea.addEventListener('focus', () => stopQuestionRotation());
                textarea.addEventListener('blur', () => !appState.stopRotationPermanently && startQuestionRotation());
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
                            otherContainer.querySelector('input').value = '';
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
            input.addEventListener('input', debouncedHandleActivity);
            input.addEventListener('change', debouncedHandleActivity);
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
            if (!appState.isUserActive) startQuestionRotation();
        } else {
            backButton.style.visibility = 'visible';
            stopQuestionRotation();
        }

        nextButton.textContent = (pageIndex === surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
    };

    // --- Validation Logic ---
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
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            data: appState.formData
        };
        storeSubmission(submission);
        showCompletionScreen();
        await syncData(); // Attempt to sync immediately after completion
    };

    const autoSubmitSurvey = () => {
        if (!appState.isUserActive) {
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
    };

    // --- Data Storage and API Communication ---
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
        const successfullySyncedIds = [];
        
        for (const submission of submissions) {
            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(submission),
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                successfullySyncedIds.push(submission.id);
                log(`Successfully synced submission ID: ${submission.id}`);
            } catch (error) {
                console.error(`Sync failed for submission ID: ${submission.id}. Will retry later.`, error);
            }
        }

        if (successfullySyncedIds.length > 0) {
            removeSyncedSubmissions(successfullySyncedIds);
            const message = `${successfullySyncedIds.length} of ${submissions.length} submissions synced.`;
            showTemporaryMessage(message, successfullySyncedIds.length === submissions.length ? 'success' : 'info');
        } else {
            showTemporaryMessage('Sync failed. Please check connection or API.', 'error');
        }
    };

    // --- UI State Management ---
    const toggleUI = (enable) => {
        const isSubmitButton = appState.currentPage === surveyQuestions.length - 1;
        nextButton.disabled = !enable;
        nextButton.innerHTML = enable ? (isSubmitButton ? 'Submit Survey' : 'Next') : `<div class="spinner"></div>`;
        backButton.disabled = !enable;
        surveyContent.classList.toggle('pointer-events-none', !enable);
        surveyContent.classList.toggle('opacity-50', !enable);
    };

    const showCompletionScreen = () => {
        questionContainer.innerHTML = `
            <div class="checkmark-container min-h-[300px]">
                <div class="checkmark-circle"><div class="checkmark-icon">✓</div></div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Thank You!</h2>
                <p class="text-gray-600 mt-2">Your feedback has been saved.</p>
            </div>`;
        nextButton.style.display = 'none';
        backButton.style.display = 'none';
        setTimeout(resetSurvey, config.resetTime);
    };

    const resetSurvey = () => {
        appState.currentPage = 0;
        appState.formData = {};
        appState.isUserActive = false;
        appState.stopRotationPermanently = false;
        form.reset();
        nextButton.style.display = 'block';
        backButton.style.display = 'block';
        renderPage(appState.currentPage);
        toggleUI(true);
    };

    // --- Admin Control Logic ---
    const hideAdminControls = () => {
        syncButton.classList.add('hidden');
        adminClearButton.classList.add('hidden');
        hideAdminButton.classList.add('hidden');
        showTemporaryMessage("Admin controls hidden.", "info");
    };

    // --- Event Handlers ---
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

    syncButton.addEventListener('click', syncData);

    adminClearButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all locally stored data? This cannot be undone.")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            showTemporaryMessage("Local data cleared.", "success");
            resetSurvey();
            hideAdminControls();
        }
    });
    
    hideAdminButton.addEventListener('click', hideAdminControls);
    
    window.addEventListener('online', () => {
        showTemporaryMessage("You are back online. Attempting to sync.", "success");
        syncData();
    });
    
    // --- Initialization ---
    renderPage(appState.currentPage);
    handleUserActivity();
    setInterval(syncData, 60 * 60 * 1000); // Attempt to sync every hour
});
