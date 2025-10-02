// --- survey-app.js (VERSION 13: Memory Leak Fixes & Error Boundaries) ---

// --- CONFIGURATION CONSTANTS ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const INACTIVITY_TIMEOUT_MS = 30000; // 30 Seconds
const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const RESET_DELAY_MS = 5000; // 5 seconds post-submission
const STORAGE_KEY_QUEUE = 'submissionQueue';
const STORAGE_KEY_STATE = 'surveyAppState';

// START OF IIFE: Creates a private scope for all code below
(function () {

    // --- UTILITIES & STATE MANAGEMENT ---
    // Function to generate a simple UUID
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
     * Safely writes a JSON item to localStorage with error handling.
     */
    function safeSetLocalStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            // Log error if quota exceeded, preventing silent data loss
            console.error(`Failed to write to localStorage for key '${key}'. Storage may be full:`, e);
        }
    }

    /**
     * Safely retrieves the submission queue.
     */
    function getSubmissionQueue() {
        return safeGetLocalStorage(STORAGE_KEY_QUEUE) || [];
    }
    // ---------------------------------------------------------------------

    // 1. GLOBAL STATE DEFINITION
    const DEFAULT_STATE = {
        currentQuestionIndex: 0,
        // CRITICAL: New UUID generated on every initial load
        formData: { id: generateUUID(), timestamp: new Date().toISOString() },
        inactivityTimer: null,
        syncTimer: null,
        rotationInterval: null,
        countdownInterval: null, // [NEW] Track countdown interval
        adminClickCount: 0
    };

    // Retrieve IN-PROGRESS state safely
    const savedState = safeGetLocalStorage(STORAGE_KEY_STATE);
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
        syncStatusMessage, progressBar;

    // Global flag to prevent concurrent sync operations
    let isSyncing = false;

    // [NEW] Store bound event handlers for proper cleanup
    let boundResetInactivityTimer = null;

    // ---------------------------------------------------------------------
    // --- UTILITIES & STATE MANAGEMENT ---
    // ---------------------------------------------------------------------

    function saveState() {
        // Saves the IN-PROGRESS survey only.
        safeSetLocalStorage(STORAGE_KEY_STATE, {
            currentQuestionIndex: appState.currentQuestionIndex,
            formData: appState.formData
        });
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

    /**
     * [IMPROVED] Clears all active application timers and intervals.
     * Ensures a clean state before resets or reloads.
     */
    function clearAllTimers() {
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
            appState.inactivityTimer = null;
        }
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
            appState.syncTimer = null;
        }
        if (appState.countdownInterval) {
            clearInterval(appState.countdownInterval);
            appState.countdownInterval = null;
        }
    }

    /**
     * [NEW] Removes all inactivity event listeners to prevent memory leaks.
     */
    function removeInactivityListeners() {
        if (boundResetInactivityTimer) {
            document.removeEventListener('mousemove', boundResetInactivityTimer);
            document.removeEventListener('keydown', boundResetInactivityTimer);
            document.removeEventListener('touchstart', boundResetInactivityTimer);
        }
    }

    /**
     * [NEW] Adds inactivity event listeners (called once during init).
     */
    function addInactivityListeners() {
        // Create bound version once for proper removal later
        boundResetInactivityTimer = resetInactivityTimer.bind(null);
        
        document.addEventListener('mousemove', boundResetInactivityTimer);
        document.addEventListener('keydown', boundResetInactivityTimer);
        document.addEventListener('touchstart', boundResetInactivityTimer);
    }

    /**
     * Updates the visual progress bar based on the current question.
     */
    function updateProgressBar() {
        if (!progressBar) return;

        const totalQuestions = window.dataUtils.surveyQuestions.length;
        // Handle division by zero if questions aren't loaded
        if (totalQuestions === 0) return;

        // Progress is based on the number of questions *viewed*, so index + 1
        const progressPercentage = Math.min(((appState.currentQuestionIndex + 1) / totalQuestions) * 100, 100);

        progressBar.style.width = `${progressPercentage}%`;
    }


    // ---------------------------------------------------------------------
    // --- VALIDATION & NAVIGATION ---
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


    // [IMPROVED] Only clears the rotation interval with safety check
    function cleanupIntervals() {
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
    }

    /**
     * [IMPROVED] Wrapped in try-catch for error boundary protection.
     */
    function showQuestion(index) {
        try {
            clearErrors();
            const q = window.dataUtils.surveyQuestions[index];
            
            if (!q) {
                throw new Error(`Question at index ${index} is undefined`);
            }
            
            const renderer = window.dataUtils.questionRenderers[q.type];
            
            if (!renderer) {
                throw new Error(`No renderer found for question type: ${q.type}`);
            }

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

            updateProgressBar();

        } catch (e) {
            console.error("Fatal Error during showQuestion render:", e);
            // [IMPROVED] Clean up any dangling intervals before showing error
            cleanupIntervals();
            questionContainer.innerHTML = '<h2 class="text-xl font-bold text-red-600">A critical error occurred. Please refresh or contact support.</h2>';
            
            // Optionally log to server for monitoring
            logErrorToServer(e, 'showQuestion');
        }
    }

    /**
     * [NEW] Optional: Log errors to server for remote monitoring
     */
    function logErrorToServer(error, context) {
        try {
            fetch('/api/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: error.message,
                    stack: error.stack,
                    context: context,
                    timestamp: new Date().toISOString(),
                    kioskId: appState.formData.id
                })
            }).catch(() => {
                // Silent fail - don't let logging errors break the app
            });
        } catch (e) {
            // Silent fail
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

    /**
     * Processes the submission queue. Clears the queue only upon successful server sync.
     * Implements Partial Sync logic based on server response.
     */
    async function syncData(showAdminFeedback = false) {
        // Implement sync lock to prevent concurrent runs
        if (isSyncing) {
            console.warn("Sync skipped: A sync operation is already in progress.");
            if (showAdminFeedback && syncStatusMessage) {
                syncStatusMessage.textContent = 'Sync is already running... ⏳';
            }
            return;
        }

        let lastError = null;
        let success = false;
        const submissionQueue = getSubmissionQueue();

        try {
            isSyncing = true; // Set lock

            if (submissionQueue.length === 0) {
                if (showAdminFeedback && syncStatusMessage) {
                    syncStatusMessage.textContent = 'No records to sync ✅';
                    setTimeout(() => syncStatusMessage.textContent = '', 3000);
                }
                return true;
            }

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
                        // Continue to retry if the whole request failed (e.g., 503, 500)
                        throw new Error(`Server returned status: ${response.status}`);
                    }
                    
                    // --- PARTIAL SYNC LOGIC ---
                    const syncResult = await response.json();
                    // ASSUMPTION: The backend returns an array of IDs it successfully saved
                    const successfulIds = syncResult.successfulIds || [];
                    
                    // Filter the current queue to keep only records whose IDs are NOT in the successful list
                    const newQueue = submissionQueue.filter(
                        record => !successfulIds.includes(record.id)
                    );
                    
                    if (newQueue.length > 0) {
                        safeSetLocalStorage(STORAGE_KEY_QUEUE, newQueue);
                        console.warn(`${successfulIds.length} records synced. ${newQueue.length} records remaining in queue.`);
                    } else {
                        localStorage.removeItem(STORAGE_KEY_QUEUE); // Clear the whole queue
                    }
                    
                    // Update UI based on partial sync results
                    updateAdminCount();

                    if (showAdminFeedback && syncStatusMessage) {
                        const statusText = newQueue.length === 0 
                            ? `Sync Successful (${submissionQueue.length} records cleared) ✅` 
                            : `Partial Sync Successful (${successfulIds.length} records cleared). ${newQueue.length} remain.`;

                        syncStatusMessage.textContent = statusText;
                        setTimeout(() => syncStatusMessage.textContent = '', 4000);
                    }
                    success = true;
                    return true;

                } catch (error) {
                    lastError = error;
                    if (attempt < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    }
                }
            }
        } finally {
            isSyncing = false; // Release lock
            if (!success) {
                // Failure: Log and update admin counter (data remains in queue)
                if (lastError) {
                    console.error(`PERMANENT FAIL: Data sync failed. Error: ${lastError.message}`);
                }
                updateAdminCount();

                if (showAdminFeedback && syncStatusMessage) {
                    syncStatusMessage.textContent = 'Manual Sync Failed ⚠️ (Check Console)';
                }
            }
        }
        return false;
    }


    function autoSync() {
        syncData(false);
    }

    /**
     * Centralized Kiosk Reset Logic
     */
    function performKioskReset() {
        // 1. Clear In-Progress State
        localStorage.removeItem(STORAGE_KEY_STATE);

        // 2. Reset In-Memory State for the next user
        appState.formData = { id: generateUUID(), timestamp: new Date().toISOString() };
        appState.currentQuestionIndex = 0;

        // 3. Restart Application Flow
        showQuestion(appState.currentQuestionIndex);
        resetInactivityTimer(); // Start the inactivity timer for the new session
        
        // 4. Ensure navigation is enabled for the new session
        nextBtn.disabled = false;
        prevBtn.disabled = true;
    }


    /**
     * [IMPROVED] Now stores countdown interval for proper cleanup
     */
    function submitSurvey() {
        clearAllTimers();

        // --- Step 1: Queue the Completed Survey ---
        const submissionQueue = getSubmissionQueue();

        // Finalize data before queuing.
        appState.formData.timestamp = new Date().toISOString();
        appState.formData.sync_status = 'unsynced';

        submissionQueue.push(appState.formData);
        safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);

        // Set progress bar to 100% on submission
        if (progressBar) {
            progressBar.style.width = '100%';
        }

        // 1. Show thank you message immediately with initial countdown element
        questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey!</h2>' +
                                      '<p id="resetCountdown" class="mt-4 text-gray-500 text-lg font-semibold">Kiosk resetting in 5 seconds...</p>';

        prevBtn.disabled = true;
        nextBtn.disabled = true;

        // 2. Start the visible countdown and the reliable reset
        let timeLeft = RESET_DELAY_MS / 1000;

        // [IMPROVED] Store countdown interval in appState
        appState.countdownInterval = setInterval(() => {
            timeLeft--;
            const countdownEl = document.getElementById('resetCountdown');

            if (countdownEl) {
                countdownEl.textContent = `Kiosk resetting in ${timeLeft} seconds...`;
            }

            if (timeLeft <= 0) {
                clearInterval(appState.countdownInterval);
                appState.countdownInterval = null;
                performKioskReset(); 
            }
        }, 1000);
    }


    // ---------------------------------------------------------------------
    // --- TIMERS & UX ---
    // ---------------------------------------------------------------------

    /**
     * [IMPROVED] No longer re-adds event listeners (they're added once in init)
     */
    function resetInactivityTimer() {
        // Clear existing timers
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
        }
        
        // Start periodic sync
        startPeriodicSync(); 

        appState.inactivityTimer = setTimeout(() => {
            const isInProgress = appState.currentQuestionIndex > 0;

            if (isInProgress) {
                console.log('Mid-survey inactivity detected. Auto-saving and resetting kiosk.');

                // --- Step 1: Queue the Abandoned Survey ---
                const submissionQueue = getSubmissionQueue();

                // Finalize data before reset.
                appState.formData.timestamp = new Date().toISOString();
                appState.formData.sync_status = 'unsynced (inactivity)';

                submissionQueue.push(appState.formData);
                safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);

                // --- Step 2: Fast Reset ---
                performKioskReset(); 
            } else {
                // On landing screen, rely on the periodic sync only.
                autoSync();
            }
        }, INACTIVITY_TIMEOUT_MS);
    }

    function startPeriodicSync() {
        appState.syncTimer = setInterval(autoSync, SYNC_INTERVAL_MS);
    }

    /**
     * [IMPROVED] Added error boundary for rotation
     */
    function rotateQuestionText(q) {
        let idx = 0;
        const labelEl = document.getElementById('rotatingQuestion');
        if (!labelEl) return;

        cleanupIntervals();

        try {
            appState.rotationInterval = setInterval(() => {
                idx = (idx + 1) % q.rotatingText.length;
                if (labelEl) { // Check element still exists
                    labelEl.textContent = q.rotatingText[idx];
                }
            }, 4000);
        } catch (e) {
            console.error('Error in text rotation:', e);
            cleanupIntervals();
        }
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
            if (confirm("WARNING: Are you sure you want to delete ALL local survey data (Queue AND In-Progress)? This is permanent.")) {
                clearAllTimers();
                localStorage.removeItem(STORAGE_KEY_STATE); 
                localStorage.removeItem(STORAGE_KEY_QUEUE);
                performKioskReset();
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
        progressBar = document.getElementById('progressBar');

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
            document.body.innerHTML = '<h1 style="color: red; text-align: center; padding-top: 50px;">Application Error: Could not load survey.</h1>'
            return;
        }

        // 2. Setup public interaction listeners
        nextBtn.addEventListener('click', goNext);
        prevBtn.addEventListener('click', goPrev);
        
        // [IMPROVED] Add inactivity listeners once (not repeatedly)
        addInactivityListeners();

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
        
        // [NEW] Optional: Log heartbeat every 15 minutes for monitoring
        setInterval(() => {
            console.log(`[HEARTBEAT] Kiosk alive. Queue: ${countUnsyncedRecords()} | Current Q: ${appState.currentQuestionIndex}`);
        }, 15 * 60 * 1000);
    });

})(); // END OF IIFE: Immediately executes the function
