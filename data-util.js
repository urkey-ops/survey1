// --- survey-app.js (Clean Version - Offline-First + Validation) ---

// 1. STATE INITIALIZATION (Offline-First)
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    // Add a status to track if data needs to be synced
    formData: { timestamp: new Date().toISOString(), sync_status: 'unsynced' }, 
    inactivityTimer: null,
    syncTimer: null
};

// Retrieve state from LocalStorage or use default
const appState = JSON.parse(localStorage.getItem('surveyAppState')) || DEFAULT_STATE;

// Get references
const questionContainer = document.getElementById('question-container');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');

// --- STATE MANAGEMENT UTILITIES ---

function saveState() {
    localStorage.setItem('surveyAppState', JSON.stringify(appState));
}

// **KEY CHANGE:** The only way to modify formData and trigger a save
function updateData(key, value) {
    // Only update if the value has changed
    if (appState.formData[key] !== value) {
        appState.formData[key] = value;
        // Mark as unsynced whenever data is changed
        appState.formData.sync_status = 'unsynced';
        saveState();
    }
}

// Utility function to clear errors
function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.classList.add('hidden');
    });
}

// --- VALIDATION LOGIC (Crucial Fix) ---

function validateQuestion(q) {
    clearErrors();
    const answer = appState.formData[q.name];
    let isValid = true;
    let errorMessage = '';

    // A. Check basic required fields (all types except custom-contact)
    if (q.required && (!answer || (typeof answer === 'string' && answer.trim() === ''))) {
        errorMessage = 'This response is required.';
        isValid = false;
    }

    // B. Handle specific complex validation for 'radio-with-other'
    if (q.type === 'radio-with-other' && answer === 'Other') {
        const otherValue = appState.formData['other_location'];
        if (!otherValue || otherValue.trim() === '') {
             document.getElementById('other_location_textError').textContent = 'Please specify your location.';
             document.getElementById('other_location_textError').classList.remove('hidden');
             isValid = false;
        }
    }
    
    // C. Handle custom-contact validation (Name and Email if consent is given)
    if (q.type === 'custom-contact') {
        const consent = appState.formData['newsletterConsent'] === 'Yes';
        const name = appState.formData['name'];
        const email = appState.formData['email'];
        
        if (consent) {
            if (!name) {
                document.getElementById('nameError').textContent = 'Name is required for contact.';
                document.getElementById('nameError').classList.remove('hidden');
                isValid = false;
            }
            if (!email || !email.includes('@')) { // Basic email check
                document.getElementById('emailError').textContent = 'Valid email is required.';
                document.getElementById('emailError').classList.remove('hidden');
                isValid = false;
            }
        }
    }

    if (!isValid) {
        // Display generic error for standard fields
        if (errorMessage) {
            document.getElementById(q.id + 'Error').textContent = errorMessage;
            document.getElementById(q.id + 'Error').classList.remove('hidden');
        }
    }
    return isValid;
}

// --- NAVIGATION & RENDERING ---

// Show a specific question
function showQuestion(index) {
    clearErrors();
    const q = window.dataUtils.surveyQuestions[index];
    const renderer = window.dataUtils.questionRenderers[q.type];

    questionContainer.innerHTML = renderer.render(q, appState.formData);
    
    // **KEY CHANGE:** Pass updateData function to the utility for decoupling
    if (renderer.setupEvents) {
        renderer.setupEvents(q, { 
            handleNextQuestion: goNext, 
            updateData: updateData // Injecting the state setter
        });
    }

    // Rotate text if applicable (Only applies to the first question in the configuration)
    if (q.rotatingText) {
        rotateQuestionText(q);
    }
    
    // Update navigation buttons
    prevBtn.disabled = index === 0;
    nextBtn.textContent = (index === window.dataUtils.surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
    nextBtn.disabled = false;
}

// Handle auto-next (Now includes validation)
function goNext() {
    const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
    
    // 1. VALIDATION CHECK
    if (!validateQuestion(currentQuestion)) {
        // Validation failed, stop and show error
        return;
    }

    // 2. Clear errors and proceed
    clearErrors();
    
    if (appState.currentQuestionIndex < window.dataUtils.surveyQuestions.length - 1) {
        appState.currentQuestionIndex++;
        saveState(); // Save current index
        showQuestion(appState.currentQuestionIndex);
    } else {
        submitSurvey(); // Finalize submission
    }
}

// Handle prev
function goPrev() {
    if (appState.currentQuestionIndex > 0) {
        appState.currentQuestionIndex--;
        saveState(); // Save current index
        showQuestion(appState.currentQuestionIndex);
    }
}

// --- SYNC & SUBMISSION LOGIC ---

// Placeholder for the Vercel Function API call
async function syncData() {
    if (appState.formData.sync_status !== 'unsynced') {
        console.log('No unsynced data found.');
        return;
    }
    
    console.log(`Attempting to sync data (ID: ${appState.formData.timestamp})`);
    
    // 1. API Call using the Vercel Function + Google Sheets API approach
    /*
    const response = await fetch('/api/survey-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appState.formData)
    });
    */
    
    // Mock success for now
    const success = true; 

    if (success) {
        console.log('Data successfully synced.');
        // 2. Mark data as synced and save state
        appState.formData.sync_status = 'synced';
        saveState();
    } else {
        console.error('Data sync failed. Will retry later.');
        // Keep status as 'unsynced'
    }
}

// Auto-sync function (for periodic and inactivity sync)
function autoSync() {
    syncData();
}

// Handle survey submission (Finalizes form)
function submitSurvey() {
    // 1. Final sync attempt
    syncData(); 

    // 2. Display confirmation and disable navigation
    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Data is saved locally and syncing.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    // 3. Clear the state in LocalStorage after a final submission/sync to prepare for the next user/session
    // localStorage.removeItem('surveyAppState'); // Uncomment this line if you want a fresh start immediately
}

// Inactivity handler (Auto-sync partial data on inactivity)
function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    appState.inactivityTimer = setTimeout(() => {
        console.log('User inactive. Auto-saving and triggering partial sync...');
        saveState(); // Ensure last-minute data is saved
        autoSync(); // Auto-sync partial data
        // Optionally, reset the form after inactivity sync
    }, 300000); // 5 min
}

// Periodic Sync Timer
function startPeriodicSync() {
    if (appState.syncTimer) clearInterval(appState.syncTimer);
    appState.syncTimer = setInterval(autoSync, 15 * 60 * 1000); // 15 mins
}

// Optional rotating text (for UX)
function rotateQuestionText(q) {
    let idx = 0;
    const labelEl = document.getElementById('rotatingQuestion');
    if (!labelEl) return;
    // Clear any existing interval to prevent overlap if showQuestion is called repeatedly
    if (appState.rotationInterval) clearInterval(appState.rotationInterval); 
    
    appState.rotationInterval = setInterval(() => {
        idx = (idx + 1) % q.rotatingText.length;
        labelEl.textContent = q.rotatingText[idx];
    }, 4000);
}


// --- INITIALIZATION ---

// Event listeners
nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);

// Start the application
showQuestion(appState.currentQuestionIndex);
resetInactivityTimer();
startPeriodicSync();
