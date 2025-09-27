// --- data-util.js ---
export const LOCAL_STORAGE_KEY = 'surveySubmissions';

// UUID generator
export const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

// Local storage helpers
export const getStoredSubmissions = () => JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');

export const storeSubmission = (submission) => {
    const submissions = getStoredSubmissions();
    submissions.push(submission);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(submissions));
};

export const removeSyncedSubmissions = (syncedIds) => {
    const submissions = getStoredSubmissions();
    const remaining = submissions.filter(s => !syncedIds.includes(s.id));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
};

// Sync function (stub for API)
export const syncData = async (API_ENDPOINT = '/api/submit-survey') => {
    const submissions = getStoredSubmissions();
    if (!submissions.length) return;

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ submissions })
        });
        const result = await response.json();

        if (result?.syncedIds?.length) {
            removeSyncedSubmissions(result.syncedIds);
        }

        return result;
    } catch (err) {
        console.error("Sync failed:", err);
        return null;
    }
};

// Progress bar helper
export const updateProgressBar = (progressBarEl, currentPage, totalPages, isSubmitted = false) => {
    let progress = (currentPage / totalPages) * 100;
    if (isSubmitted) progress = 100;
    progressBarEl.style.width = `${progress}%`;
};

// Temporary status message helper
export const showTemporaryMessage = (statusMessageEl, message, type = 'info') => {
    const className = type === 'error' ? 'bg-red-100 text-red-700' :
                      type === 'success' ? 'bg-green-100 text-green-700' :
                      'bg-yellow-100 text-yellow-700';

    statusMessageEl.textContent = message;
    statusMessageEl.className = `block p-4 mb-4 rounded-xl text-center font-medium ${className}`;
    statusMessageEl.style.display = 'block';
    setTimeout(() => { statusMessageEl.style.display = 'none'; }, 5000);
};
