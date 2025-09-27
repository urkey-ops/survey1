// --- survey-app.js (VERSION 4: Offline Queue & Fast Reset) ---

// --- UTILITIES & STATE MANAGEMENT ---
// Function to generate a simple UUID (NEW UTILITY)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
// ---------------------------------------------------------------------

// 1. GLOBAL STATE DEFINITION (UPDATED: Removed sync_status from appState)
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    // ID is generated here. The 'sync_status' will now live only on the queue records.
    formData: { id: generateUUID(), timestamp: new Date().toISOString() }, 
    inactivityTimer: null,
    syncTimer: null,
    rotationInterval: null, 
    postSubmitResetTimer: null,
    adminClickCount: 0 
};

// Retrieve IN-PROGRESS state from LocalStorage or use default
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
    // Saves the IN-PROGRESS survey only.
    localStorage.setItem('surveyAppState', JSON.stringify({
        currentQuestionIndex: appState.currentQuestionIndex,
        formData: appState.formData
    }));
}

function updateData(key, value) {
    if (appState.formData[key] !== value) {
        appState.formData[key] = value;
        // NOTE: No sync_status update here, as that is only tracked on the final queued item.
        saveState();
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

// --- NEW/REVISED: Admin Counter now checks the submission queue ---
function countUnsyncedRecords() {
    // REVISED 2: Count the records in the submission queue
    const submissionQueue = JSON.parse(localStorage.getItem('submissionQueue')) || [];
    return submissionQueue.length;
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
// --- VALIDATION & NAVIGATION (Unchanged from previous version) ---
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
// --- SYNC & SUBMISSION LOGIC (HEAVILY REVISED) ---
// ---------------------------------------------------------------------

/** * Silent Sync Logic: Performs API call with retries and processes the entire queue. 
 * showAdminFeedback flag determines if status messages are displayed in the Admin Panel.
 */
async function syncData(showAdminFeedback = false) {
    // REVISED 2: Read the entire queue
    const submissionQueue = JSON.parse(localStorage.getItem('submissionQueue')) || [];

    if (submissionQueue.length === 0) {
        if (showAdminFeedback && syncStatusMessage) {
            syncStatusMessage.textContent = 'No records to sync ✅';
            setTimeout(() => syncStatusMessage.textContent = '', 3000);
        }
        return true;
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError = null;

    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = `Syncing ${submissionQueue.length} records... ⏳`;
    }

    // REVISED 2: The payload is the entire queue array.
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
                // Important: Throw the error to trigger the retry loop
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            // SUCCESS: The server has the data, so we can now safely clear the local queue.
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

    // Failure: Log to console and update admin counter
    console.error(`PERMANENT FAIL: Data sync failed. Error: ${lastError.message}`);
    updateAdminCount(); // This still ensures the admin panel shows the failure count
    
    if (showAdminFeedback && syncStatusMessage) {
        syncStatusMessage.textContent = 'Manual Sync Failed ⚠️ (Check Console)';
        // Keep the failure message visible until the admin hides the panel or clicks again
    }
    return false;
}

function autoSync() {
    // Runs in the background, non-blocking.
    syncData(false);
}

function submitSurvey() {
    if (appState.rotationInterval) clearInterval(appState.rotationInterval);
    // Note: Do NOT stop appState.syncTimer here, let the periodic sync keep running.
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer); 

    // --- NEW LOGIC: Queue the Completed Survey (Step 1) ---
    const submissionQueue = JSON.parse(localStorage.getItem('submissionQueue')) || [];
    
    // CRITICAL: Ensure the current timestamp is final before queuing.
    appState.formData.timestamp = new Date().toISOString();
    // Add a status flag to the queued item for future debugging, if needed.
    appState.formData.sync_status = 'unsynced';
    
    submissionQueue.push(appState.formData);
    localStorage.setItem('submissionQueue', JSON.stringify(submissionQueue));

    // 1. Show thank you message immediately
    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Kiosk resetting in 5 seconds.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    // 2. Schedule the fast, reliable reset
    appState.postSubmitResetTimer = setTimeout(() => {
        // IMPORTANT: Clear only the IN-PROGRESS state, leaving the queue intact.
        localStorage.removeItem('surveyAppState'); 
        window.location.reload(); 
    }, 5000); 
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
             
             // --- NEW LOGIC: Queue the Abandoned Survey (Step 1) ---
             const submissionQueue = JSON.parse(localStorage.getItem('submissionQueue')) || [];
             
             // CRITICAL: Finalize data before reset, ID is already present from initial state.
             appState.formData.timestamp = new Date().toISOString();
             appState.formData.sync_status = 'unsynced (inactivity)';
             
             submissionQueue.push(appState.formData);
             localStorage.setItem('submissionQueue', JSON.stringify(submissionQueue));

             // --- Step 3: Fast Reset (autoSync is removed from here) ---
             localStorage.removeItem('surveyAppState');
             window.location.reload();
        } else {
             // Only save/sync if not in progress (i.e., on the landing screen)
             // On landing screen, we just rely on the periodic sync.
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
    
    // Clear Local Data Button (REVISED: Now clears the queue too)
    adminClearButton.addEventListener('click', () => {
        if (confirm("WARNING: Are you sure you want to delete ALL local survey data (Queue AND In-Progress)? This is permanent.")) {
            // Clear the IN-PROGRESS state and the SUBMISSION QUEUE
            localStorage.removeItem('surveyAppState');
            localStorage.removeItem('submissionQueue'); // NEW LINE
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
