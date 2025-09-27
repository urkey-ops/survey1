// --- survey-app.js (VERSION 6: Q1 Button Visibility Fix) ---

// --- CONFIGURATION CONSTANTS ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const INACTIVITY_TIMEOUT_MS = 300000; // 5 minutes
const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const RESET_DELAY_MS = 5000; // 5 seconds post-submission

// --- UTILITIES & STATE MANAGEMENT ---
// Function to generate a simple UUID (UPDATED with crypto API fallback)
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Safely retrieves and parses a JSON item from localStorage.
 */
function safeGetLocalStorage(key) {
    const item = localStorage.getItem(key);
    if (!item) return null;
    try {
        return JSON.parse(item);
    } catch (e) {
        console.warn(`Failed to parse saved state for key '${key}':`, e);
        return null; // Treat corrupted data as missing data
    }
}

/**
 * Safely retrieves the submission queue. (NEW UTILITY)
 */
function getSubmissionQueue() {
    return safeGetLocalStorage('submissionQueue') || [];
}

/**
 * NEW: Attaches an 'input' listener to a text field to immediately enable the Next button.
 * This forces the button to adopt its correct orange/white styling, bypassing CSS conflicts.
 * The button is ENABLED by default, so this just ensures a visual refresh.
 */
function refreshNextButtonOnInput(inputId) {
    const inputField = document.getElementById(inputId);
    const nextBtn = document.getElementById('nextBtn');
    
    if (!inputField || !nextBtn) return;

    // The handler function simply ensures the button's state is explicitly 'enabled'.
    const enableButtonHandler = () => {
        nextBtn.disabled = false;
        // Optionally, check length > 0, but for this visual fix, just the 'input' event is enough.
    };

    // Attach listener to run the check every time the input changes
    inputField.addEventListener('input', enableButtonHandler);
    
    // Run once immediately in case the user reloads with saved text
    enableButtonHandler();
}
// ---------------------------------------------------------------------

// 1. GLOBAL STATE DEFINITION
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    formData: { id: generateUUID(), timestamp: new Date().toISOString() }, 
    inactivityTimer: null,
    syncTimer: null,
    rotationInterval: null, 
    postSubmitResetTimer: null,
    adminClickCount: 0 
};

// Retrieve IN-PROGRESS state safely
const savedState = safeGetLocalStorage('surveyAppState');
const appState = { 
    ...DEFAULT_STATE, 
    ...(savedState ? { 
        currentQuestionIndex: savedState.currentQuestionIndex || 0, 
        formData: savedState.formData || DEFAULT_STATE.formData 
    } : {})
};

// Global variables for DOM elements (Assigned inside DOMContentLoaded)
let questionContainer, nextBtn, prevBtn, 
    mainTitle, adminControls, unsyncedCountDisplay, 
    syncButton, adminClearButton, hideAdminButton,
    syncStatusMessage; 


// ---------------------------------------------------------------------
// --- UTILITIES & STATE MANAGEMENT ---
// ---------------------------------------------------------------------

function saveState() {
    // Saves the IN-PROGRESS survey only.
    localStorage.setItem('surveyAppState', JSON.stringify({
        currentQuestionIndex: appState.currentQuestionIndex,
        formData: appState.formData
    }));
}

function updateData(key, value) {
    if (appState.formData[key] !== value) {
        appState.formData[key] = value;
        saveState();
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

function countUnsyncedRecords() {
    return getSubmissionQueue().length;
}

function updateAdminCount() {
    if (unsyncedCountDisplay) {
        const count = countUnsyncedRecords();
        unsyncedCountDisplay.textContent = `Unsynced Records: ${count}`;
        
        if (count > 0) {
            unsyncedCountDisplay.classList.remove('text-green-600');
            unsyncedCountDisplay.classList.add('text-red-600');
        } else {
            unsyncedCountDisplay.classList.remove('text-red-600');
            unsyncedCountDisplay.classList.add('text-green-600');
        }
    }
}

// ---------------------------------------------------------------------
// --- VALIDATION & NAVIGATION (Logic Unchanged) ---
// ---------------------------------------------------------------------

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; 

function validateQuestion(q) {
    clearErrors();
    const answer = appState.formData[q.name];
    let isValid = true;
    let errorMessage = '';

    const displayError = (id, message) => {
        const errorEl = document.getElementById(id);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        } else {
            console.warn(`Validation Error: Missing HTML element for ID '${id}' in question '${q.id}'`);
        }
    };

    if (q.required && (!answer || (typeof answer === 'string' && answer.trim() === ''))) {
        errorMessage = 'This response is required.';
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

    if (!isValid && errorMessage) {
        displayError(q.id + 'Error', errorMessage);
    }
    
    return isValid;
}


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
        
        // --- ADDED FIX LOGIC FOR Q1 INTERACTIVITY ---
        if (index === 0 && q.type === 'text') { 
            // Delay slightly to ensure the HTML element has rendered, then attach listener
            setTimeout(() => { 
                refreshNextButtonOnInput(q.name); // Assuming input ID is q.name
            }, 50); 
        }
        // --- END ADDED FIX LOGIC ---


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
        nextBtn.disabled = false; // Always enabled here
        
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

function goPrev() {
    if (appState.currentQuestionIndex > 0) {
        cleanupIntervals();
        
        appState.currentQuestionIndex--;
        saveState();
        showQuestion(appState.currentQuestionIndex);
    }
}


// ---------------------------------------------------------------------
// --- SYNC & SUBMISSION LOGIC ---
// ---------------------------------------------------------------------

/** * Processes the submission queue. Clears the queue only upon successful server sync.
 */
async function syncData(showAdminFeedback = false) {
    const submissionQueue = getSubmissionQueue(); // Uses the safe getter

    if (submissionQueue.length === 0) {
        if (showAdminFeedback && syncStatusMessage) {
            syncStatusMessage.textContent = 'No records to sync ✅';
            setTimeout(() => syncStatusMessage.textContent = '', 3000);
        }
        return true;
    }

    let lastError = null;

    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = `Syncing ${submissionQueue.length} records... ⏳`;
    }

    // The payload is the entire queue array, ready for the Vercel function.
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
                setTimeout(() => syncStatusMessage.textContent = '', 3000);
            }
            return true;
            
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
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
    if (appState.rotationInterval) clearInterval(appState.rotationInterval);
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer); 

    // --- Step 1: Queue the Completed Survey ---
    const submissionQueue = getSubmissionQueue(); // Uses the safe getter
    
    // Finalize data before queuing.
    appState.formData.timestamp = new Date().toISOString();
    appState.formData.sync_status = 'unsynced';
    
    submissionQueue.push(appState.formData);
    localStorage.setItem('submissionQueue', JSON.stringify(submissionQueue));

    // 1. Show thank you message immediately
    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Kiosk resetting in 5 seconds.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    // 2. Schedule the fast, reliable reset
    appState.postSubmitResetTimer = setTimeout(() => {
        // CRITICAL FIX: Ensure the in-progress state is set to Question 1 (Index 0)
        appState.currentQuestionIndex = 0; 
        
        // Clear only the IN-PROGRESS state, leaving the queue intact.
        localStorage.removeItem('surveyAppState'); 
        window.location.reload(); 
    }, RESET_DELAY_MS); 
}


// ---------------------------------------------------------------------
// --- TIMERS & UX (Updated for Fast Reset) ---
// ---------------------------------------------------------------------

function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer);

    appState.inactivityTimer = setTimeout(() => {
        
        const isInProgress = appState.currentQuestionIndex > 0;
        
        if (isInProgress) {
             console.log('Mid-survey inactivity detected. Auto-saving and resetting kiosk.');
             
             // --- Step 1: Queue the Abandoned Survey ---
             const submissionQueue = getSubmissionQueue(); // Uses the safe getter
             
             // Finalize data before reset.
             appState.formData.timestamp = new Date().toISOString();
             appState.formData.sync_status = 'unsynced (inactivity)';
             
             submissionQueue.push(appState.formData);
             localStorage.setItem('submissionQueue', JSON.stringify(submissionQueue));

             // --- Step 3: Fast Reset (autoSync call removed) ---
             // CRITICAL FIX: Ensure the in-progress state is set to Question 1 (Index 0)
             appState.currentQuestionIndex = 0; 

             localStorage.removeItem('surveyAppState');
             window.location.reload();
        } else {
             // On landing screen, rely on the periodic sync only.
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
    // 5-Click Access Handler
    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        if (appState.adminClickCount >= 5) {
            toggleAdminPanel(true);
            appState.adminClickCount = 0; 
        }
    });

    // Hide Button
    hideAdminButton.addEventListener('click', () => {
        toggleAdminPanel(false);
    });

    // Manual Sync Button
    syncButton.addEventListener('click', () => {
        syncData(true); 
    });
    
    // Clear Local Data Button (Clears In-Progress and the Queue)
    adminClearButton.addEventListener('click', () => {
        if (confirm("WARNING: Are you sure you want to delete ALL local survey data (Queue AND In-Progress)? This is permanent.")) {
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
    
    // 1. Assign ALL DOM elements
    questionContainer = document.getElementById('questionContainer');
    nextBtn = document.getElementById('nextBtn');
    prevBtn = document.getElementById('prevBtn');
    mainTitle = document.getElementById('mainTitle'); 
    
    // Admin elements
    adminControls = document.getElementById('adminControls'); 
    syncButton = document.getElementById('syncButton'); 
    adminClearButton = document.getElementById('adminClearButton'); 
    hideAdminButton = document.getElementById('hideAdminButton');
    unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay'); 
    syncStatusMessage = document.getElementById('syncStatusMessage'); 
    
    // Check critical public elements
    if (!questionContainer || !nextBtn || !prevBtn || !mainTitle) {
        console.error("CRITICAL ERROR: Missing essential HTML elements. Survey cannot start.");
        return; 
    }

    // 2. Setup public interaction listeners
    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);

    // 3. Setup administrator access
    if (adminControls) {
        adminControls.classList.add('hidden'); 
        setupAdminAccess();
    } else {
          console.warn("Admin controls container 'adminControls' is missing. Manual features disabled.");
    }
    
    // 4. Start the application flow
    showQuestion(appState.currentQuestionIndex);
    resetInactivityTimer();
    startPeriodicSync();
});
