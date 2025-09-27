// --- survey-app.js ---
import { surveyQuestions, questionRenderers, uuidv4, LOCAL_STORAGE_KEY, getStoredSubmissions, storeSubmission, removeSyncedSubmissions, syncData, updateProgressBar, showTemporaryMessage } from './data-util.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
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

    // --- Config ---
    const DEBUG_MODE = true;
    const log = (msg, ...args) => DEBUG_MODE && console.log('[DEBUG]', msg, ...args);

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

    // --- App State ---
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

    // --- Inactivity & Auto-Submit ---
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
        if (appState.countdownIntervalId) clearInterval(appState.countdownIntervalId);

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

    // --- Question Rotation ---
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

    // --- Render Page ---
    const renderPage = (pageIndex) => {
        const questionData = surveyQuestions[pageIndex];
        if (!questionData) return;

        const renderer = questionRenderers[questionData.type];
        if (!renderer) {
            questionContainer.innerHTML = `<p class="text-red-500">Error: Question type "${questionData.type}" not found.</p>`;
            return;
        }

        questionContainer.innerHTML = renderer.render(questionData, appState.formData);
        updateProgressBar(progressBar, appState.currentPage, surveyQuestions.length);

        const allInputs = questionContainer.querySelectorAll('input, textarea');
        allInputs.forEach(input => {
            input.addEventListener('input', resetInactivityTimer);
            input.addEventListener('change', resetInactivityTimer);
        });

        renderer.setupEvents(questionData, { handleNextQuestion });

        const firstInput = questionContainer.querySelector('input:not([type="hidden"]), textarea');
        if (firstInput) firstInput.focus();

        if (pageIndex === 0) {
            backButton.style.visibility = 'hidden';
            startQuestionRotation();
        } else {
            backButton.style.visibility = 'visible';
            stopQuestionRotation();
        }

        nextButton.textContent = (pageIndex === surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
    };

    // --- Validation ---
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
        if (fieldInput) fieldInput.classList.add('has-error');
    };

    const validatePage = () => {
        clearValidationErrors();
        const questionData = surveyQuestions[appState.currentPage];
        let isValid = true;

        const currentData = Object.fromEntries(new FormData(form));
        Object.assign(appState.formData, currentData);
        log("Updated appState.formData:", appState.formData);

        const value = appState.formData[questionData.name];

        if (questionData.required) {
            if (questionData.type !== 'custom-contact' && (!value || (typeof value === 'string' && value.trim() === ''))) {
                isValid = false;
                showValidationError(questionData.id, "This field is required.");
            }
        }

        if (questionData.type === 'radio-with-other' && value === 'Other' && !appState.formData.other_location?.trim()) {
            isValid = false;
            showValidationError('other_location_text', "Please specify your location.");
        }

        if (questionData.type === 'custom-contact') {
            const name = appState.formData.name?.trim();
            const email = appState.formData.email?.trim();
            const consent = appState.formData.newsletterConsent === 'Yes';

            if (!name) {
                isValid = false;
                showValidationError('name', "Your name is required.");
            }

            if (consent) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!email || !emailRegex.test(email)) {
                    isValid = false;
                    showValidationError('email', "Please enter a valid email address to subscribe.");
                }
            }
        }

        return isValid;
    };

    // --- Navigation & Submission ---
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
        await syncData();
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
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        overlay.classList.remove('flex', 'opacity-100');
        overlay.classList.add('invisible', 'opacity-0');

        updateProgressBar(progressBar, appState.currentPage, surveyQuestions.length, true);

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

    // --- Admin Controls ---
    const hideAdminControls = () => {
        syncButton.classList.add('hidden');
        adminClearButton.classList.add('hidden');
        hideAdminButton.classList.add('hidden');
        showTemporaryMessage(statusMessage, "Admin controls hidden.", "info");
    };

    // --- Event Listeners ---
    nextButton.addEventListener('click', e => { e.preventDefault(); handleNextQuestion(); });
    backButton.addEventListener('click', e => {
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
            showTemporaryMessage(statusMessage, "Admin mode activated.");
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

    syncButton.addEventListener('click', async () => { await syncData(); });

    adminClearButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all local submissions? This cannot be undone.")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            showTemporaryMessage(statusMessage, "All local submissions cleared.", "success");
        }
    });

    hideAdminButton.addEventListener('click', hideAdminControls);

    // --- Initial Setup ---
    renderPage(appState.currentPage);
    resetInactivityTimer();

    // --- Periodic Sync ---
    appState.syncIntervalId = setInterval(syncData, 900000); // 15 min
});
