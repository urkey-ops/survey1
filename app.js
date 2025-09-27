// --- Core Application Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const form = document.getElementById('surveyForm');
    const statusMessage = document.getElementById('statusMessage');
    const syncButton = document.getElementById('syncButton');
    const adminClearButton = document.getElementById('adminClearButton');
    const hideAdminButton = document.getElementById('hideAdminButton');
    const mainTitle = document.getElementById('mainTitle');
    const nextButton = document.getElementById('nextButton');
    const backButton = document.getElementById('backButton');
    const questionContainer = document.getElementById('questionContainer');
    const surveyContent = document.getElementById('surveyContent');
    const overlay = document.getElementById('overlay');
    const countdownSpan = document.getElementById('countdown');

    const LOCAL_STORAGE_KEY = 'surveySubmissions';
    const config = {
        rotationSpeed: 50,
        rotationDisplayTime: 4000,
        resetTime: 5000,
        adminClicksRequired: 5,
        adminClickTimeout: 3000,
        inactivityTime: 30000,
        autoSubmitCountdown: 5
    };

    const DEBUG_MODE = true;
    const log = (message, ...args) => DEBUG_MODE && console.log(`[DEBUG] ${message}`, ...args);

    // --- App State ---
    const appState = {
        currentPage: 0,
        formData: {},
        questionRotationIndex: 0,
        typingTimeout: null,
        displayTimeout: null,
        inactivityTimeout: null,
        countdownIntervalId: null,
        adminClickCount: 0,
        adminTimer: null,
        stopRotationPermanently: false,
        syncIntervalId: null
    };

    const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    // --- LocalStorage & Sync ---
    const getStoredSubmissions = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
    const storeSubmission = (submission) => {
        const submissions = getStoredSubmissions();
        submissions.push(submission);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
        log("Stored submission locally:", submission);
    };
    const removeSyncedSubmissions = (syncedIds) => {
        const submissions = getStoredSubmissions().filter(s => !syncedIds.includes(s.id));
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
    };
    const syncData = async () => {
        const submissions = getStoredSubmissions();
        if (!submissions.length) return;
        log("Syncing submissions:", submissions);

        try {
            // Dummy API call placeholder
            // Replace with actual fetch/axios call in production
            await new Promise(res => setTimeout(res, 500));

            const syncedIds = submissions.map(s => s.id);
            removeSyncedSubmissions(syncedIds);
            showTemporaryMessage("All data synced successfully.", "success");
        } catch (err) {
            log("Sync failed:", err);
            showTemporaryMessage("Sync failed. Will retry later.", "error");
        }
    };

    // --- UI Helpers ---
    const updateProgressBar = (isSubmitted = false) => {
        let progress = (appState.currentPage / surveyQuestions.length) * 100;
        if (isSubmitted) progress = 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
    };

    const showTemporaryMessage = (message, type = 'info') => {
        const className = type === 'error' ? 'bg-red-100 text-red-700' : (type === 'success' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700');
        statusMessage.textContent = message;
        statusMessage.className = `block p-4 mb-4 rounded-xl text-center font-medium ${className}`;
        statusMessage.style.display = 'block';
        setTimeout(() => statusMessage.style.display = 'none', 5000);
    };

    const resetInactivityTimer = () => {
        clearTimeout(appState.inactivityTimeout);
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
            overlay.classList.add('invisible', 'opacity-0');
            overlay.classList.remove('flex', 'opacity-100');
        }
        appState.inactivityTimeout = setTimeout(handleInactivityTimeout, config.inactivityTime);
    };

    const handleInactivityTimeout = () => {
        const firstQ = surveyQuestions[0].name;
        if (appState.formData[firstQ] && appState.formData[firstQ].trim()) {
            autoSubmitSurvey();
        } else {
            resetSurvey();
        }
    };

    const autoSubmitSurvey = () => {
        if (appState.countdownIntervalId) clearInterval(appState.countdownIntervalId);
        overlay.classList.remove('invisible', 'opacity-0');
        overlay.classList.add('flex', 'opacity-100');

        let countdown = config.autoSubmitCountdown;
        countdownSpan.textContent = countdown;

        appState.countdownIntervalId = setInterval(() => {
            countdown--;
            countdownSpan.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(appState.countdownIntervalId);
                appState.countdownIntervalId = null;

                const submission = {
                    id: uuidv4(),
                    timestamp: new Date().toISOString(),
                    data: appState.formData,
                    is_incomplete: true
                };
                storeSubmission(submission);
                resetSurvey();
                syncData();
            }
        }, 1000);
    };

    // --- Navigation ---
    const toggleUI = (enable) => {
        nextButton.disabled = !enable;
        nextButton.innerHTML = enable ? (appState.currentPage === surveyQuestions.length - 1 ? 'Submit Survey' : 'Next') : `<div class="spinner"></div>`;
        backButton.disabled = !enable;
        surveyContent.classList.toggle('pointer-events-none', !enable);
        surveyContent.classList.toggle('opacity-100', enable);
        surveyContent.classList.toggle('opacity-50', !enable);
    };

    const showCompletionScreen = () => {
        if (appState.countdownIntervalId) {
            clearInterval(appState.countdownIntervalId);
            appState.countdownIntervalId = null;
        }
        overlay.classList.add('invisible', 'opacity-0');
        updateProgressBar(true);

        questionContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full checkmark-container min-h-[300px]">
                <div class="flex items-center justify-center w-24 h-24 rounded-full checkmark-circle">
                    <div class="text-white text-6xl checkmark-icon">✓</div>
                </div>
                <h2 class="text-2xl font-bold text-gray-800 mt-6">Thank You!</h2>
                <p class="text-gray-600 mt-2">Your feedback has been saved.</p>
            </div>
        `;

        nextButton.disabled = true;
        backButton.disabled = true;
        setTimeout(resetSurvey, config.resetTime);
    };

    const resetSurvey = () => {
        appState.currentPage = 0;
        appState.formData = {};
        appState.stopRotationPermanently = false;
        if (appState.countdownIntervalId) clearInterval(appState.countdownIntervalId);

        overlay.classList.add('invisible', 'opacity-0');
        overlay.classList.remove('flex', 'opacity-100');

        form.reset();
        nextButton.disabled = false;
        backButton.disabled = false;

        renderPage(appState.currentPage);
        toggleUI(true);
        resetInactivityTimer();
    };

    const handleNextQuestion = async () => {
        if (!validatePage()) return;

        toggleUI(false);
        if (appState.currentPage < surveyQuestions.length - 1) {
            appState.currentPage++;
            renderPage(appState.currentPage);
            toggleUI(true);
        } else {
            const submission = {
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                data: appState.formData
            };
            storeSubmission(submission);
            showCompletionScreen();
            await syncData();
        }
    };

    // --- Event Listeners ---
    nextButton.addEventListener('click', handleNextQuestion);
    backButton.addEventListener('click', () => {
        if (appState.currentPage > 0) {
            appState.currentPage--;
            renderPage(appState.currentPage);
        }
    });

    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        clearTimeout(appState.adminTimer);
        appState.adminTimer = setTimeout(() => appState.adminClickCount = 0, config.adminClickTimeout);

        if (appState.adminClickCount === config.adminClicksRequired) {
            showTemporaryMessage("Admin mode activated.");
            syncButton.classList.remove('hidden');
            adminClearButton.classList.remove('hidden');
            hideAdminButton.classList.remove('hidden');
            appState.adminClickCount = 0;
        }
    });

    hideAdminButton.addEventListener('click', () => {
        syncButton.classList.add('hidden');
        adminClearButton.classList.add('hidden');
        hideAdminButton.classList.add('hidden');
        showTemporaryMessage("Admin controls hidden.", "info");
    });

    adminClearButton.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all local submissions?")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            showTemporaryMessage("All local submissions cleared.", "success");
        }
    });

    overlay.querySelector('#cancelButton').addEventListener('click', () => {
        if (appState.countdownIntervalId) clearInterval(appState.countdownIntervalId);
        overlay.classList.add('invisible', 'opacity-0');
        overlay.classList.remove('flex', 'opacity-100');
        resetInactivityTimer();
    });

    // --- Initial Render ---
    renderPage(appState.currentPage);
    resetInactivityTimer();

    // Periodic Sync
    appState.syncIntervalId = setInterval(syncData, 900000); // every 15 mins
});
