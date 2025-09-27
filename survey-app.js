// --- survey-app.js (Final Production & Resilient Version) ---

// 1. GLOBAL STATE DEFINITION
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    // Add timestamp for unique ID/ordering and sync_status for offline-first tracking
    formData: { timestamp: new Date().toISOString(), sync_status: 'unsynced' }, 
    inactivityTimer: null,
    syncTimer: null,
    rotationInterval: null, // Timer reference for rotation cleanup
};

// Retrieve state from LocalStorage or use default
const savedState = JSON.parse(localStorage.getItem('surveyAppState'));
const appState = { 
    ...DEFAULT_STATE, 
    ...(savedState ? { 
        currentQuestionIndex: savedState.currentQuestionIndex, 
        formData: savedState.formData 
    } : {})
};

// Global variables for DOM elements (Assigned inside DOMContentLoaded)
let questionContainer, nextBtn, prevBtn, syncStatusIndicator;


// --- UTILITIES & STATE MANAGEMENT ---

function saveState() {
    localStorage.setItem('surveyAppState', JSON.stringify({
        currentQuestionIndex: appState.currentQuestionIndex,
        formData: appState.formData
    }));
}

function updateData(key, value) {
    if (appState.formData[key] !== value) {
        appState.formData[key] = value;
        appState.formData.sync_status = 'unsynced';
        saveState();
        updateSyncStatusUI('unsynced');
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

// Update a visible indicator for administrators
function updateSyncStatusUI(status) {
    if (!syncStatusIndicator) return;

    let text, color;
    switch (status) {
        case 'synced':
            text = 'Synced ✅';
            color = 'text-green-600';
            break;
        case 'unsynced':
            text = 'Unsynced 🔄';
            color = 'text-yellow-600';
            break;
        case 'syncing':
            text = 'Syncing... ⏳';
            color = 'text-gray-500';
            break;
        case 'failed':
            text = 'Sync Failed ⚠️';
            color = 'text-red-600';
            break;
        default:
            text = '';
            color = 'text-gray-500';
    }
    syncStatusIndicator.textContent = text;
    // Note: Tailwind classes are assumed to exist in your environment
    syncStatusIndicator.className = `absolute top-0 right-0 p-2 text-sm font-bold ${color}`;
}


// --- VALIDATION LOGIC ---

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; 

function validateQuestion(q) {
    clearErrors();
    const answer = appState.formData[q.name];
    let isValid = true;
    let errorMessage = '';

    // Helper to display error safely
    const displayError = (id, message) => {
        const errorEl = document.getElementById(id);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        } else {
            console.warn(`Validation Error: Missing HTML element for ID '${id}' in question '${q.id}'`);
        }
    };

    // A. Check basic required fields 
    if (q.required && (!answer || (typeof answer === 'string' && answer.trim() === ''))) {
        errorMessage = 'This response is required.';
        isValid = false;
    }

    // B. Handle 'radio-with-other' validation
    if (q.type === 'radio-with-other' && answer === 'Other') {
        const otherValue = appState.formData['other_location'];
        if (!otherValue || otherValue.trim() === '') {
             displayError('other_location_textError', 'Please specify your location.');
             isValid = false;
        }
    }
    
    // C. Handle custom-contact validation
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

    if (!isValid && errorMessage) {
        displayError(q.id + 'Error', errorMessage);
    }
    
    return isValid;
}


// --- NAVIGATION & RENDERING ---

/** Ensures no rotation intervals are running, preventing memory leaks. */
function cleanupIntervals() {
    if (appState.rotationInterval) {
        clearInterval(appState.rotationInterval);
        appState.rotationInterval = null;
    }
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
        nextBtn.disabled = false;
    } catch (e) {
        console.error("Fatal Error during showQuestion render:", e);
        questionContainer.innerHTML = '<h2 class="text-xl font-bold text-red-600">A critical error occurred. Please refresh.</h2>';
    }
}

function goNext() {
    const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
    
    if (!validateQuestion(currentQuestion)) {
        return; 
    }

    cleanupIntervals(); // Clear rotation interval before navigation
    
    clearErrors();
    
    if (appState.currentQuestionIndex < window.dataUtils.surveyQuestions.length - 1) {
        appState.currentQuestionIndex++;
        saveState();
        showQuestion(appState.currentQuestionIndex);
    } else {
        submitSurvey();
    }
}

function goPrev() {
    if (appState.currentQuestionIndex > 0) {
        cleanupIntervals(); // Clear rotation interval before navigation
        
        appState.currentQuestionIndex--;
        saveState();
        showQuestion(appState.currentQuestionIndex);
    }
}


// --- SYNC & SUBMISSION LOGIC ---

/** * Handles API sync with retry mechanism (Vercel Function + Google Sheets API).
 * Attempts to sync data up to MAX_RETRIES times for kiosk resilience.
 */
async function syncData() {
    if (appState.formData.sync_status !== 'unsynced') {
        return true;
    }
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError = null;

    updateSyncStatusUI('syncing');

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // API Call to your Vercel Function endpoint
            const response = await fetch('/api/survey-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appState.formData)
            });

            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            appState.formData.sync_status = 'synced';
            saveState();
            updateSyncStatusUI('synced');
            return true;
            
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }

    // Final Failure Handling
    console.error(`Data sync failed permanently after ${MAX_RETRIES} attempts. Error: ${lastError.message}`);
    updateSyncStatusUI('failed');
    
    // Notify the admin/user (critical for kiosk operation)
    alert("CRITICAL WARNING: Data sync failed after multiple retries. Data is safe locally, but requires manual attention (check network/server log).");
    
    return false;
}

function autoSync() {
    syncData();
}

function submitSurvey() {
    syncData(); 

    // Final cleanup of all timers
    if (appState.rotationInterval) clearInterval(appState.rotationInterval);
    if (appState.syncTimer) clearInterval(appState.syncTimer);

    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Data is saved locally and syncing.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    // OPTIONAL: Uncomment to reset the kiosk for the next user immediately.
    // localStorage.removeItem('surveyAppState'); 
}


// --- TIMERS & UX ---

function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    appState.inactivityTimer = setTimeout(() => {
        saveState(); 
        autoSync(); 
    }, 300000); // 5 minutes
}

function startPeriodicSync() {
    if (appState.syncTimer) clearInterval(appState.syncTimer);
    appState.syncTimer = setInterval(autoSync, 15 * 60 * 1000); // 15 minutes
}

function rotateQuestionText(q) {
    let idx = 0;
    const labelEl = document.getElementById('rotatingQuestion');
    if (!labelEl) return;
    
    cleanupIntervals(); // Clear existing rotation interval
    
    appState.rotationInterval = setInterval(() => {
        idx = (idx + 1) % q.rotatingText.length;
        labelEl.textContent = q.rotatingText[idx];
    }, 4000);
}


// --- INITIALIZATION FIX (CRITICAL) ---

// Wait for the entire HTML document to be loaded before accessing elements.
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Assign DOM elements (must match HTML IDs exactly: questionContainer, nextBtn, prevBtn)
    questionContainer = document.getElementById('questionContainer');
    nextBtn = document.getElementById('nextBtn');
    prevBtn = document.getElementById('prevBtn');
    syncStatusIndicator = document.getElementById('sync-status-indicator'); 
    
    if (!questionContainer || !nextBtn || !prevBtn) {
        console.error("CRITICAL ERROR: Missing essential HTML elements. Survey cannot start.");
        return; 
    }

    // 2. Event listeners 
    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);

    // 3. Start the application flow
    showQuestion(appState.currentQuestionIndex);
    resetInactivityTimer();
    startPeriodicSync();
    updateSyncStatusUI(appState.formData.sync_status);
});
