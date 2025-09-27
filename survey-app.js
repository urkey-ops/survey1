// --- survey-app.js (FINAL VERSION - Kiosk Ready with Hidden Admin - FIXED URL) ---

// 1. GLOBAL STATE DEFINITION
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    formData: { timestamp: new Date().toISOString(), sync_status: 'unsynced' }, 
    inactivityTimer: null,
    syncTimer: null,
    rotationInterval: null, 
    postSubmitResetTimer: null,
    adminClickCount: 0 
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
let questionContainer, nextBtn, prevBtn, 
    mainTitle, adminControls, unsyncedCountDisplay, 
    syncButton, adminClearButton, hideAdminButton,
    syncStatusMessage; 


// ---------------------------------------------------------------------
// --- UTILITIES & STATE MANAGEMENT ---
// ---------------------------------------------------------------------

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
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

function countUnsyncedRecords() {
    // Only checks the current record's sync status
    return appState.formData.sync_status === 'unsynced' ? 1 : 0;
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
// --- VALIDATION & NAVIGATION (REVERTED TO PREVIOUS WORKING VERSION) ---
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
// --- SYNC & SUBMISSION LOGIC (Updated for Admin Feedback) ---
// ---------------------------------------------------------------------

/** * Silent Sync Logic: Performs API call with retries. 
 * showAdminFeedback flag determines if status messages are displayed in the Admin Panel.
 */
async function syncData(showAdminFeedback = false) {
    if (appState.formData.sync_status !== 'unsynced') {
        if (showAdminFeedback && syncStatusMessage) {
            syncStatusMessage.textContent = 'Already Synced ✅';
            setTimeout(() => syncStatusMessage.textContent = '', 3000);
        }
        return true;
    }
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError = null;

    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = 'Syncing... ⏳';
    }

    // FIX 1: Wrap the single form data into the 'submissions' array structure the server expects.
    const payload = {
        submissions: [appState.formData] 
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // FIX 2: Correct the API endpoint URL from '/api/survey-sync' to the actual file path.
            const response = await fetch('/api/submit-survey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // If we get here, it means the 404 was fixed, but another server error occurred.
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            // Success: Update status and counter
            appState.formData.sync_status = 'synced';
            saveState();
            updateAdminCount(); 
            
            if (showAdminFeedback && syncStatusMessage) {
                syncStatusMessage.textContent = 'Manual Sync Successful ✅';
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

    // Failure: Log to console and update admin counter
    console.error(`SILENT FAIL: Data sync failed permanently. Error: ${lastError.message}`);
    updateAdminCount(); 
    
    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = 'Manual Sync Failed ⚠️ (Check Console)';
        // Keep the failure message visible until the admin hides the panel or clicks again
    }
    return false;
}

function autoSync() {
    // Background sync runs silently (default argument is false)
    syncData(false);
}

function submitSurvey() {
    syncData(); 

    if (appState.rotationInterval) clearInterval(appState.rotationInterval);
    if (appState.syncTimer) clearInterval(appState.syncTimer);
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer); 

    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Kiosk resetting in 5 seconds.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    appState.postSubmitResetTimer = setTimeout(() => {
        localStorage.removeItem('surveyAppState'); 
        window.location.reload(); 
    }, 5000); 
}


// ---------------------------------------------------------------------
// --- TIMERS & UX (Updated for Two-Way Auto-Reset) ---
// ---------------------------------------------------------------------

function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer);

    appState.inactivityTimer = setTimeout(() => {
        
        const isInProgress = appState.currentQuestionIndex > 0;
        
        if (isInProgress) {
              console.log('Mid-survey inactivity detected. Auto-saving, syncing, and resetting kiosk.');
              
              saveState(); 
              autoSync();
              
              localStorage.removeItem('surveyAppState');
              window.location.reload();
        } else {
              saveState();
              autoSync();
        }
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
    
    cleanupIntervals();
    
    appState.rotationInterval = setInterval(() => {
        idx = (idx + 1) % q.rotatingText.length;
        labelEl.textContent = q.rotatingText[idx];
    }, 4000);
}


// ---------------------------------------------------------------------
// --- ADMIN ACCESS LOGIC (Updated for Visibility and Feedback) ---
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
        // Manual sync provides immediate feedback to the admin (true)
        syncData(true); 
    });
    
    // Clear Local Data Button
    adminClearButton.addEventListener('click', () => {
        if (confirm("WARNING: Are you sure you want to delete ALL local survey data? This is permanent.")) {
            // Clear the local state and reload to a fresh start
            localStorage.removeItem('surveyAppState');
            window.location.reload();
        }
    });
}

function toggleAdminPanel(show) {
    if (show) {
        adminControls.classList.remove('hidden');
        updateAdminCount(); 
        // Ensure the status message is clear on opening
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
