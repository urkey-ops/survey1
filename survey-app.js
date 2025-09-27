// --- survey-app.js (VERSION 9: Graceful Countdown Reset with Next always visible except submit) ---

// --- CONFIGURATION CONSTANTS ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const INACTIVITY_TIMEOUT_MS = 30000; // 30 Seconds
const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const RESET_DELAY_MS = 5000; // 5 seconds post-submission

// --- UTILITIES & STATE MANAGEMENT ---
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function safeGetLocalStorage(key) {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
        return JSON.parse(item);
    } catch (e) {
        console.warn(`Failed to parse saved state for key '${key}':`, e);
        return null;
    }
}

function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error(`Failed to write to localStorage for key '${key}'. Storage may be full:`, e);
    }
}

function getSubmissionQueue() {
    return safeGetLocalStorage('submissionQueue') || [];
}

// --- VALIDATION & NAVIGATION ---

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateQuestion(q) {
    clearErrors();
    const answer = appState.formData[q.name];
    let isValid = true;

    const displayError = (id, message) => {
        const errorEl = document.getElementById(id);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    };

    if (q.required && (!answer || (typeof answer === 'string' && answer.trim() === ''))) {
        displayError(q.id + 'Error', 'This response is required.');
        isValid = false;
    }

    if (q.type === 'radio-with-other' && answer === 'Other') {
        const otherValue = appState.formData['other_location'];
        if (!otherValue || otherValue.trim() === '') {
            displayError('other_location_textError', 'Please specify your location.');
            isValid = false;
        }
    }

    if (q.type === 'custom-contact') {
        const consent = appState.formData['newsletterConsent'] === 'Yes';
        const name = appState.formData['name'];
        const email = appState.formData['email'];

        if (consent) {
            if (!name) {
                displayError('nameError', 'Name is required for contact.');
                isValid = false;
            }
            if (!email || !emailRegex.test(email)) {
                displayError('emailError', 'Please enter a valid email address.');
                isValid = false;
            }
        }
    }

    return isValid;
}

function showQuestion(index) {
    try {
        clearErrors();
        const q = window.dataUtils.surveyQuestions[index];
        const renderer = window.dataUtils.questionRenderers[q.type];

        questionContainer.innerHTML = renderer.render(q, appState.formData);

        if (renderer.setupEvents) {
            renderer.setupEvents(q, { 
                handleNextQuestion: goNext, 
                updateData: updateData 
            });
        }

        if (q.rotatingText) {
            rotateQuestionText(q);
        }

        prevBtn.disabled = index === 0;
        nextBtn.textContent = (index === window.dataUtils.surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
        nextBtn.disabled = false;  // Always enabled on question display
        nextBtn.classList.remove('button-disabled-style'); // Remove visual disable style on show
    } catch (e) {
        console.error("Fatal Error during showQuestion render:", e);
        questionContainer.innerHTML = '<h2 class="text-xl font-bold text-red-600">A critical error occurred. Please refresh.</h2>';
    }
}

function goNext() {
    const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];

    if (!validateQuestion(currentQuestion)) {
        // Add visual disabled style but keep button enabled
        nextBtn.classList.add('button-disabled-style');
        return; // Prevent progression
    }
    // Remove visual disabled style on valid
    nextBtn.classList.remove('button-disabled-style');

    cleanupIntervals();
    clearErrors();

    if (appState.currentQuestionIndex < window.dataUtils.surveyQuestions.length - 1) {
        appState.currentQuestionIndex++;
        saveState();
        showQuestion(appState.currentQuestionIndex);
    } else {
        submitSurvey();
    }
}

// ... (all other functions remain unchanged)

// In submitSurvey, buttons are disabled during final reset only

function submitSurvey() {
    clearAllTimers();
    const submissionQueue = getSubmissionQueue();

    appState.formData.timestamp = new Date().toISOString();
    appState.formData.sync_status = 'unsynced';

    submissionQueue.push(appState.formData);
    safeSetLocalStorage('submissionQueue', submissionQueue);

    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey!</h2>' +
                                  '<p id="resetCountdown" class="mt-4 text-gray-500 text-lg font-semibold">Kiosk resetting in 5 seconds...</p>';

    prevBtn.disabled = true;
    nextBtn.disabled = true;  // Only now disables buttons

    let timeLeft = RESET_DELAY_MS / 1000;

    const countdownInterval = setInterval(() => {
        timeLeft--;
        const countdownEl = document.getElementById('resetCountdown');
        if (countdownEl) {
            countdownEl.textContent = `Kiosk resetting in ${timeLeft} seconds...`;
        }
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            appState.currentQuestionIndex = 0;
            localStorage.removeItem('surveyAppState');
            window.location.reload();
        }
    }, 1000);
}
