// --- survey-app.js (Clean Version - Offline-First + Validation) ---

// 1. STATE INITIALIZATION (Offline-First)
const DEFAULT_STATE = {
    currentQuestionIndex: 0,
    // Add a status to track if data needs to be synced and a timestamp for unique ID/ordering
    formData: { timestamp: new Date().toISOString(), sync_status: 'unsynced' }, 
    inactivityTimer: null,
    syncTimer: null
};

// Retrieve state from LocalStorage or use default
// Note: We only restore simple values like index and formData; timers are initialized fresh.
const savedState = JSON.parse(localStorage.getItem('surveyAppState'));
const appState = { 
    ...DEFAULT_STATE, 
    ...(savedState ? { 
        currentQuestionIndex: savedState.currentQuestionIndex, 
        formData: savedState.formData 
    } : {})
};

// Get references
const questionContainer = document.getElementById('question-container');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');

// --- STATE MANAGEMENT UTILITIES ---

/** Saves the current index and form data to LocalStorage. */
function saveState() {
    localStorage.setItem('surveyAppState', JSON.stringify({
        currentQuestionIndex: appState.currentQuestionIndex,
        formData: appState.formData
    }));
}

/** * The only way to modify formData and trigger a save. 
 * This function is passed to the utility module (data-util.js).
 */
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

// --- VALIDATION LOGIC ---

/** Validates the current question before allowing navigation. */
function validateQuestion(q) {
    clearErrors();
    const answer = appState.formData[q.name];
    let isValid = true;
    let errorMessage = '';

    // A. Check basic required fields (based on the 'required' flag in data-util.js)
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
            // Basic email check: must exist and contain an @ symbol
            if (!email || !email.includes('@')) { 
                document.getElementById('emailError').textContent = 'Valid email is required.';
                document.getElementById('emailError').classList.remove('hidden');
                isValid = false;
            }
        }
    }

    if (!isValid && errorMessage) {
        // Display generic error for standard fields
        document.getElementById(q.id + 'Error').textContent = errorMessage;
        document.getElementById(q.id + 'Error').classList.remove('hidden');
    }
    
    return isValid;
}

// --- NAVIGATION & RENDERING ---

/** Shows the question at the specified index. */
function showQuestion(index) {
    clearErrors();
    const q = window.dataUtils.surveyQuestions[index];
    const renderer = window.dataUtils.questionRenderers[q.type];

    questionContainer.innerHTML = renderer.render(q, appState.formData);
    
    // **KEY CHANGE:** Inject the decoupled updateData function
    if (renderer.setupEvents) {
        renderer.setupEvents(q, { 
            handleNextQuestion: goNext, 
            updateData: updateData // Injecting the state setter
        });
    }

    // Rotate text if applicable
    if (q.rotatingText) {
        rotateQuestionText(q);
    }
    
    // Update navigation buttons
    prevBtn.disabled = index === 0;
    nextBtn.textContent = (index === window.dataUtils.surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
    nextBtn.disabled = false;
}

/** Handles moving to the next question, only after validation passes. */
function goNext() {
    const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
    
    // 1. VALIDATION CHECK (Crucial for required fields)
    if (!validateQuestion(currentQuestion)) {
        return; // Validation failed, stop and show error
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

/** Handles moving to the previous question. */
function goPrev() {
    if (appState.currentQuestionIndex > 0) {
        appState.currentQuestionIndex--;
        saveState(); // Save current index
        showQuestion(appState.currentQuestionIndex);
    }
}

// --- SYNC & SUBMISSION LOGIC ---

/** Placeholder for the Vercel Function API call to sync data. */
async function syncData() {
    if (appState.formData.sync_status !== 'unsynced') {
        // console.log('No unsynced data found.');
        return true;
    }
    
    console.log(`Attempting to sync data (ID: ${appState.formData.timestamp}) to Vercel/Google Sheets.`);
    
    // 1. Call your Vercel Function API here
    // Example: 
    /*
    try {
        const response = await fetch('/api/survey-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.formData)
        });
        if (!response.ok) throw new Error('Network response was not ok');
        
        console.log('Data successfully synced.');
        appState.formData.sync_status = 'synced';
        saveState();
        return true;
    } catch (error) {
        console.error('Data sync failed:', error);
        return false;
    }
    */
    
    // Mock success for now
    const success = true; 
    if (success) {
        console.log('Data successfully synced (Mock).');
        appState.formData.sync_status = 'synced';
        saveState();
        return true;
    }
    return false;
}

/** Triggers an auto-sync (used by periodic and inactivity timers). */
function autoSync() {
    syncData();
}

/** Handles survey submission, triggers final sync, and updates UI. */
function submitSurvey() {
    // 1. Final sync attempt
    syncData(); 

    // 2. Display confirmation and disable navigation
    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey! Data is saved locally and syncing.</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    
    // 3. Optional: Clear the state to prepare for the next in-house user.
    // localStorage.removeItem('surveyAppState'); 
}

// --- TIMERS & UX ---

/** Resets the inactivity timer and triggers a partial auto-sync upon timeout. */
function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    appState.inactivityTimer = setTimeout(() => {
        console.log('User inactive. Auto-saving and triggering partial sync.');
        saveState(); 
        autoSync(); // Auto-sync partial data
    }, 300000); // 5 minutes (300,000 ms)
}

/** Starts the periodic data sync timer. */
function startPeriodicSync() {
    if (appState.syncTimer) clearInterval(appState.syncTimer);
    appState.syncTimer = setInterval(autoSync, 15 * 60 * 1000); // 15 minutes
}

/** Rotates the text for Question 1 for visual interest. */
function rotateQuestionText(q) {
    let idx = 0;
    const labelEl = document.getElementById('rotatingQuestion');
    if (!labelEl) return;
    
    // Clear any existing interval to prevent overlap
    if (appState.rotationInterval) clearInterval(appState.rotationInterval); 
    
    appState.rotationInterval = setInterval(() => {
        idx = (idx + 1) % q.rotatingText.length;
        labelEl.textContent = q.rotatingText[idx];
    }, 4000);
}


// --- INITIALIZATION ---

// Event listeners for user activity and navigation
nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);

// Start the application flow
showQuestion(appState.currentQuestionIndex);
resetInactivityTimer();
startPeriodicSync();
