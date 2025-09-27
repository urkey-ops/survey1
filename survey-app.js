// --- survey-app.js ---
const appState = {
    currentQuestionIndex: 0,
    formData: {},
    inactivityTimer: null
};

// Get references
const questionContainer = document.getElementById('question-container');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');

// Utility function to clear errors
function clearErrors() {
    document.querySelectorAll('.error-message').forEach(el => el.classList.add('hidden'));
}

// Show a specific question
function showQuestion(index) {
    clearErrors();
    const q = window.dataUtils.surveyQuestions[index];
    questionContainer.innerHTML = window.dataUtils.questionRenderers[q.type].render(q, appState.formData);
    if (window.dataUtils.questionRenderers[q.type].setupEvents) {
        window.dataUtils.questionRenderers[q.type].setupEvents(q, { handleNextQuestion: goNext });
    }
    // Rotate text if applicable
    if (q.rotatingText) {
        rotateQuestionText(q);
    }
    prevBtn.disabled = index === 0;
    nextBtn.disabled = false;
}

// Handle auto-next
function goNext() {
    if (appState.currentQuestionIndex < window.dataUtils.surveyQuestions.length - 1) {
        appState.currentQuestionIndex++;
        showQuestion(appState.currentQuestionIndex);
    } else {
        submitSurvey();
    }
}

// Handle prev
function goPrev() {
    if (appState.currentQuestionIndex > 0) {
        appState.currentQuestionIndex--;
        showQuestion(appState.currentQuestionIndex);
    }
}

// Handle survey submission
function submitSurvey() {
    console.log('Survey submitted:', appState.formData);
    questionContainer.innerHTML = '<h2 class="text-xl font-bold text-green-600">Thank you for completing the survey!</h2>';
    nextBtn.disabled = true;
    prevBtn.disabled = true;
}

// Optional rotating text
function rotateQuestionText(q) {
    let idx = 0;
    const labelEl = document.getElementById('rotatingQuestion');
    if (!labelEl) return;
    const rotateInterval = setInterval(() => {
        idx = (idx + 1) % q.rotatingText.length;
        labelEl.textContent = q.rotatingText[idx];
    }, 4000);
}

// Inactivity handler
function resetInactivityTimer() {
    if (appState.inactivityTimer) clearTimeout(appState.inactivityTimer);
    appState.inactivityTimer = setTimeout(() => {
        console.log('User inactive. Auto-submitting survey...');
        submitSurvey();
    }, 300000); // 5 min
}

// Event listeners
nextBtn.addEventListener('click', goNext);
prevBtn.addEventListener('click', goPrev);
document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);

// Initialize
showQuestion(appState.currentQuestionIndex);
resetInactivityTimer();
