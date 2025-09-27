document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('surveyForm');
    const statusMessage = document.getElementById('statusMessage');
    const syncButton = document.getElementById('syncButton');
    const adminClearButton = document.getElementById('adminClearButton');
    const hideAdminButton = document.getElementById('hideAdminButton');
    const mainTitle = document.getElementById('mainTitle');
    const nextButton = document.getElementById('nextButton');
    const backButton = document.getElementById('backButton');
    const questionContainer = document.getElementById('questionContainer');
    const overlay = document.getElementById('overlay');
    const countdownSpan = document.getElementById('countdown');
    const cancelButton = document.getElementById('cancelButton');
    const progressBar = document.getElementById('progressBar');

    const LOCAL_STORAGE_KEY = 'surveySubmissions';

    const config = {
        rotationSpeed: 50,
        rotationDisplayTime: 4000,
        resetTime: 5000,
        adminClicksRequired: 5,
        adminClickTimeout: 3000,
        inactivityTime: 30000,
        autoSubmitCountdown: 5,
    };

    const surveyQuestions = [
        {
            id: 'comments',
            name: 'comments',
            type: 'textarea',
            question: '1. What did you like about your visit today?',
            placeholder: 'Type your comments here...',
            required: true,
            rotatingText: [
                "1. What did you like about your visit today?",
                "1. What could we do better during your next visit?",
                "1. Do you have any general comments or suggestions?",
                "1. What was the most memorable part of your experience?"
            ]
        },
        // ... other questions
    ];

    const state = {
        currentPage: 0,
        formData: {},
        rotationIndex: 0,
        typingTimeout: null,
        displayTimeout: null,
        inactivityTimeout: null,
        countdownInterval: null,
        adminClickCount: 0,
        adminTimer: null,
        stopRotation: false,
    };

    // -------------------
    // UTILITIES
    // -------------------
    const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const saveLocal = () => {
        let data = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        const currentData = {...state.formData, timestamp: Date.now()};
        data.push(currentData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    };

    const updateProgressBar = () => {
        progressBar.style.width = `${((state.currentPage) / surveyQuestions.length) * 100}%`;
    };

    const resetInactivityTimer = () => {
        clearTimeout(state.inactivityTimeout);
        clearInterval(state.countdownInterval);
        overlay.classList.add('invisible', 'opacity-0');
        overlay.classList.remove('flex', 'opacity-100');

        state.inactivityTimeout = setTimeout(triggerInactivityOverlay, config.inactivityTime);
    };

    // -------------------
    // ROTATION LOGIC
    // -------------------
    const startRotation = () => {
        if(state.stopRotation) return;
        const q = surveyQuestions[0];
        const label = document.getElementById('rotatingQuestion');
        if(!label) return;

        const text = q.rotatingText[state.rotationIndex % q.rotatingText.length];
        label.textContent = '';

        let i = 0;
        const typeLetter = () => {
            if(i < text.length){
                label.textContent += text[i];
                i++;
                state.typingTimeout = setTimeout(typeLetter, config.rotationSpeed);
            } else {
                state.displayTimeout = setTimeout(() => {
                    state.rotationIndex++;
                    startRotation();
                }, config.rotationDisplayTime);
            }
        };
        typeLetter();
    };

    // -------------------
    // RENDER LOGIC
    // -------------------
    const renderPage = (index) => {
        state.currentPage = index;
        const q = surveyQuestions[index];
        questionContainer.innerHTML = '';
        let html = '';

        if(q.type === 'textarea'){
            html = `<label id="rotatingQuestion" for="${q.id}" class="block text-gray-700 font-semibold mb-2">${q.rotatingText[0]}</label>
                    <textarea id="${q.id}" name="${q.name}" placeholder="${q.placeholder}" required class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-sewa-orange">${state.formData[q.name] || ''}</textarea>`;
            questionContainer.innerHTML = html;
            if(index === 0) startRotation();
        }

        // Add other types here (star, number-scale, location, etc.)

        updateProgressBar();
    };

    // -------------------
    // VALIDATION
    // -------------------
    const validatePage = () => {
        const q = surveyQuestions[state.currentPage];
        const input = document.querySelector(`[name="${q.name}"]`);
        if(q.required && input && !input.value.trim()){
            statusMessage.textContent = 'Please answer this question.';
            statusMessage.classList.remove('hidden');
            return false;
        }
        statusMessage.classList.add('hidden');
        return true;
    };

    // -------------------
    // NAVIGATION
    // -------------------
    nextButton.addEventListener('click', () => {
        if(!validatePage()) return;

        // Save current page data
        const q = surveyQuestions[state.currentPage];
        const input = document.querySelector(`[name="${q.name}"]`);
        if(input) state.formData[q.name] = input.value.trim();

        if(state.currentPage < surveyQuestions.length - 1){
            renderPage(state.currentPage + 1);
        } else {
            submitSurvey();
        }
        resetInactivityTimer();
    });

    backButton.addEventListener('click', () => {
        if(state.currentPage > 0){
            renderPage(state.currentPage - 1);
        }
        resetInactivityTimer();
    });

    // -------------------
    // SUBMIT
    // -------------------
    const submitSurvey = () => {
        saveLocal();
        state.formData = {};
        renderPage(0);
        progressBar.style.width = '100%';
    };

    // -------------------
    // INACTIVITY OVERLAY
    // -------------------
    const triggerInactivityOverlay = () => {
        overlay.classList.remove('invisible','opacity-0');
        overlay.classList.add('flex','opacity-100');
        let countdown = config.autoSubmitCountdown;
        countdownSpan.textContent = countdown;
        cancelButton.classList.remove('hidden');

        state.countdownInterval = setInterval(() => {
            countdown--;
            countdownSpan.textContent = countdown;
            if(countdown <= 0){
                clearInterval(state.countdownInterval);
                overlay.classList.add('invisible','opacity-0');
                overlay.classList.remove('flex','opacity-100');
                cancelButton.classList.add('hidden');
                submitSurvey();
            }
        }, 1000);
    };

    cancelButton.addEventListener('click', () => {
        clearInterval(state.countdownInterval);
        overlay.classList.add('invisible','opacity-0');
        overlay.classList.remove('flex','opacity-100');
        cancelButton.classList.add('hidden');
        resetInactivityTimer();
    });

    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);

    // -------------------
    // ADMIN MODE
    // -------------------
    mainTitle.addEventListener('click', () => {
        state.adminClickCount++;
        clearTimeout(state.adminTimer);
        state.adminTimer = setTimeout(() => state.adminClickCount = 0, config.adminClickTimeout);
        if(state.adminClickCount >= config.adminClicksRequired){
            adminClearButton.classList.remove('hidden');
            syncButton.classList.remove('hidden');
            hideAdminButton.classList.remove('hidden');
        }
    });

    hideAdminButton.addEventListener('click', () => {
        adminClearButton.classList.add('hidden');
        syncButton.classList.add('hidden');
        hideAdminButton.classList.add('hidden');
        state.adminClickCount = 0;
    });

    // -------------------
    // INIT
    // -------------------
    renderPage(0);
    resetInactivityTimer();
});
