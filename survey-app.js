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
        nextBtn.disabled = false; // Always enabled on question display
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

// ---------------------------------------------------------------------
// --- SYNC & SUBMISSION LOGIC ---
// ---------------------------------------------------------------------

async function syncData(showAdminFeedback = false) {
    const submissionQueue = getSubmissionQueue();

    if (submissionQueue.length === 0) {
        if (showAdminFeedback && syncStatusMessage) {
            syncStatusMessage.textContent = 'No records to sync ✅';
            setTimeout(() => (syncStatusMessage.textContent = ''), 3000);
        }
        return true;
    }

    let lastError = null;

    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = `Syncing ${submissionQueue.length} records... ⏳`;
    }

    const payload = {
        submissions: submissionQueue
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch('/api/submit-survey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }

            // SUCCESS: Clear the local queue and update admin panel
            localStorage.removeItem('submissionQueue');
            updateAdminCount();

            if (showAdminFeedback && syncStatusMessage) {
                syncStatusMessage.textContent = `Sync Successful (${submissionQueue.length} records cleared) ✅`;
                setTimeout(() => (syncStatusMessage.textContent = ''), 3000);
            }
            return true;
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }

    // Failure: Log and update admin counter (data remains in queue)
    console.error(`PERMANENT FAIL: Data sync failed. Error: ${lastError.message}`);
    updateAdminCount();

    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = 'Manual Sync Failed ⚠️ (Check Console)';
    }
    return false;
}

function autoSync() {
    syncData(false);
}

function submitSurvey() {
    clearAllTimers();
    const submissionQueue = getSubmissionQueue();

    appState.formData.timestamp = new Date().toISOString();
    appState.formData.sync_status = 'unsynced';

    submissionQueue.push(appState.formData);
    safeSetLocalStorage('submissionQueue', submissionQueue);

    questionContainer.innerHTML =
        '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey!</h2>' +
        '<p id="resetCountdown" class="mt-4 text-gray-500 text-lg font-semibold">Kiosk resetting in 5 seconds...</p>';

    prevBtn.disabled = true;
    nextBtn.disabled = true;

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

// ---------------------------------------------------------------------
// --- TIMERS & UX ---
// ---------------------------------------------------------------------

function resetInactivityTimer() {
    clearAllTimers();

    appState.inactivityTimer = setTimeout(() => {
        const isInProgress = appState.currentQuestionIndex > 0;

        if (isInProgress) {
            console.log('Mid-survey inactivity detected. Auto-saving and resetting kiosk.');

            const submissionQueue = getSubmissionQueue();

            appState.formData.timestamp = new Date().toISOString();
            appState.formData.sync_status = 'unsynced (inactivity)';

            submissionQueue.push(appState.formData);
            safeSetLocalStorage('submissionQueue', submissionQueue);

            appState.currentQuestionIndex = 0;

            localStorage.removeItem('surveyAppState');
            window.location.reload();
        } else {
            autoSync();
        }
    }, INACTIVITY_TIMEOUT_MS);
}

function startPeriodicSync() {
    if (appState.syncTimer) clearInterval(appState.syncTimer);
    appState.syncTimer = setInterval(autoSync, SYNC_INTERVAL_MS);
}

function rotateQuestionText(q) {
    let idx = 0;
    const labelEl = document.getElementById('rotatingQuestion');
    if (!labelEl) return;

    cleanupIntervals();

    appState.rotationInterval = setInterval(() => {
        idx = (idx + 1) % q.rotatingText.length;
        labelEl.textContent = q.rotatingText[idx];
    }, 4000);
}

// ---------------------------------------------------------------------
// --- ADMIN ACCESS LOGIC ---
// ---------------------------------------------------------------------

function setupAdminAccess() {
    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        if (appState.adminClickCount >= 5) {
            toggleAdminPanel(true);
            appState.adminClickCount = 0;
        }
    });

    hideAdminButton.addEventListener('click', () => {
        toggleAdminPanel(false);
    });

    syncButton.addEventListener('click', () => {
        syncData(true);
    });

    adminClearButton.addEventListener('click', () => {
        if (
            confirm(
                'WARNING: Are you sure you want to delete ALL local survey data (Queue AND In-Progress)? This is permanent.'
            )
        ) {
            clearAllTimers();

            localStorage.removeItem('surveyAppState');
            localStorage.removeItem('submissionQueue');
            window.location.reload();
        }
    });
}

function toggleAdminPanel(show) {
    if (show) {
        adminControls.classList.remove('hidden');
        updateAdminCount();
        if (syncStatusMessage) syncStatusMessage.textContent = '';
    } else {
        adminControls.classList.add('hidden');
        appState.adminClickCount = 0;
    }
}

// ---------------------------------------------------------------------
// --- INITIALIZATION (CRITICAL) ---
// ---------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    questionContainer = document.getElementById('questionContainer');
    nextBtn = document.getElementById('nextBtn');
    prevBtn = document.getElementById('prevBtn');
    mainTitle = document.getElementById('mainTitle');

    adminControls = document.getElementById('adminControls');
    syncButton = document.getElementById('syncButton');
    adminClearButton = document.getElementById('adminClearButton');
    hideAdminButton = document.getElementById('hideAdminButton');
    unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay');
    syncStatusMessage = document.getElementById('syncStatusMessage');

    if (!questionContainer || !nextBtn || !prevBtn || !mainTitle) {
        console.error('CRITICAL ERROR: Missing essential HTML elements. Survey cannot start.');
        return;
    }

    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);

    if (adminControls) {
        adminControls.classList.add('hidden');
        setupAdminAccess();
    } else {
        console.warn("Admin controls container 'adminControls' is missing. Manual features disabled.");
    }

    showQuestion(appState.currentQuestionIndex);
    resetInactivityTimer();
    startPeriodicSync();
});
