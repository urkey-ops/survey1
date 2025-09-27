// --- survey-app.js (Final Production & Resilient Version with Hidden Admin Panel) ---

// 1. GLOBAL STATE DEFINITION
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    formData: { timestamp: new Date().toISOString(), sync_status: 'unsynced' }, 
    inactivityTimer: null,
    syncTimer: null,
    rotationInterval: null, 
    postSubmitResetTimer: null,
    adminClickCount: 0 // New state for tracking header clicks
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
    syncButton, adminClearButton, hideAdminButton;


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
    }
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

// **NEW:** Count how many records are stored locally and marked 'unsynced'
function countUnsyncedRecords() {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('surveyAppState')) { 
            try {
                const data = JSON.parse(localStorage.getItem(key));
                if (data && data.formData && data.formData.sync_status === 'unsynced') {
                    count++;
                }
            } catch (e) {
                console.warn(`Error parsing localStorage item ${key}:`, e);
            }
        }
    }
    // Note: This logic assumes only ONE surveyAppState is saved.
    // For multiple entries, keys would need to be timestamped.
    // Sticking to one entry for this scope: check the current formData sync status.
    if (appState.formData.sync_status === 'unsynced') {
        // Assume 1 unsynced record if current state is unsynced
        return 1;
    }
    return 0; // Otherwise, assume 0
}

function updateAdminCount() {
    if (unsyncedCountDisplay) {
        const count = countUnsyncedRecords();
        unsyncedCountDisplay.textContent = `Unsynced Records: ${count}`;
        
        // Simple visual feedback for admin
        if (count > 0) {
            unsyncedCountDisplay.classList.remove('text-green-600');
            unsyncedCountDisplay.classList.add('text-red-600');
        } else {
            unsyncedCountDisplay.classList.remove('text-red-600');
            unsyncedCountDisplay.classList.add('text-green-600');
        }
    }
}

// --- VALIDATION & NAVIGATION (UNCHANGED) ---

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


// --- SYNC & SUBMISSION LOGIC ---

/** * SILENT Sync Logic: Removes all user-facing feedback/alerts.
 * Updates the admin counter upon failure/success.
 */
async function syncData() {
    if (appState.formData.sync_status !== 'unsynced') {
        return true;
    }
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch('/api/survey-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(appState.formData)
            });

            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            // Success: Update status and counter
            appState.formData.sync_status = 'synced';
            saveState();
            updateAdminCount(); 
            return true;
            
        } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }

    // Failure: No blocking alert, just log and update admin counter
    console.error(`SILENT FAIL: Data sync failed permanently after ${MAX_RETRIES} attempts. Error: ${lastError.message}`);
    updateAdminCount(); 
    return false;
}

function autoSync() {
    syncData();
}

/**
 * Handles survey submission and triggers an immediate auto-reset.
 */
function submitSurvey() {
    // Attempt final sync (silently)
    syncData(); 

    // Final cleanup of background timers
    if (appState.rotationInterval) clearInterval(appState.rotationInterval);
    if (appState.syncTimer) clearInterval(appState.syncTimer);
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer); 

    // Display thank you message (5-second delay)
    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Kiosk resetting in 5 seconds.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    // Auto-Reset after Completion
    appState.postSubmitResetTimer = setTimeout(() => {
        localStorage.removeItem('surveyAppState'); 
        window.location.reload(); 
    }, 5000); 
}


// --- TIMERS & UX ---

/**
 * Resets inactivity timer; handles mid-survey auto-reset if inactive for too long.
 */
function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    
    if (appState.postSubmitResetTimer) clearTimeout(appState.postSubmitResetTimer);

    appState.inactivityTimer = setTimeout(() => {
        
        const isInProgress = appState.currentQuestionIndex > 0;
        
        if (isInProgress) {
             console.log('Mid-survey inactivity detected. Auto-saving, syncing, and resetting kiosk.');
             
             // 1. Save and sync partial data (silently)
             saveState(); 
             autoSync();
             
             // 2. Force reset immediately after saving partial data
             localStorage.removeItem('surveyAppState');
             window.location.reload();
        } else {
             // If on Q1 and inactive, just save/sync and wait for the next interaction/timer
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


// --- ADMIN ACCESS LOGIC ---

function setupAdminAccess() {
    // New: Handle click counter for admin panel toggle
    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        if (appState.adminClickCount >= 5) {
            toggleAdminPanel(true);
            appState.adminClickCount = 0; // Reset counter after successful access
        }
    });

    // New: Handle hide button click
    hideAdminButton.addEventListener('click', () => {
        toggleAdminPanel(false);
    });

    // New: Handle manual sync click
    syncButton.addEventListener('click', () => {
        syncData(); // Triggers the same silent sync
        updateAdminCount(); // Immediately update the counter after manual sync attempt
    });
    
    // New: Handle clear data click
    adminClearButton.addEventListener('click', () => {
        if (confirm("WARNING: Are you sure you want to delete ALL local survey data? This is permanent.")) {
            localStorage.removeItem('surveyAppState');
            window.location.reload();
        }
    });
}

function toggleAdminPanel(show) {
    if (show) {
        adminControls.classList.remove('hidden');
        updateAdminCount(); // Show the current count immediately
    } else {
        adminControls.classList.add('hidden');
        appState.adminClickCount = 0; // Reset for security
    }
}


// --- INITIALIZATION (CRITICAL) ---

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Assign ALL DOM elements (MUST MATCH HTML IDs EXACTLY)
    questionContainer = document.getElementById('questionContainer');
    nextBtn = document.getElementById('nextBtn');
    prevBtn = document.getElementById('prevBtn');
    mainTitle = document.getElementById('mainTitle'); // Target for 5-click access
    
    // Group all admin buttons into one element for easier visibility toggle (Requires one wrapper DIV in HTML)
    // NOTE: For this code to work, you must wrap syncButton, adminClearButton, hideAdminButton 
    // AND unsyncedCountDisplay into a single container DIV with an ID like 'adminControls'.
    adminControls = document.getElementById('adminControls'); 
    syncButton = document.getElementById('syncButton'); 
    adminClearButton = document.getElementById('adminClearButton'); 
    hideAdminButton = document.getElementById('hideAdminButton');
    unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay'); // New element ID
    
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
        adminControls.classList.add('hidden'); // Ensure controls start hidden
        setupAdminAccess();
    } else {
         console.warn("Admin controls container 'adminControls' is missing. Manual features disabled.");
    }
    
    // 4. Start the application flow
    showQuestion(appState.currentQuestionIndex);
    resetInactivityTimer();
    startPeriodicSync();
});
