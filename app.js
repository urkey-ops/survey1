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
    const surveyContent = document.getElementById('surveyContent');
    const overlay = document.getElementById('overlay');
    const countdownSpan = document.getElementById('countdown');
    const cancelButton = document.getElementById('cancelButton');
    const progressBar = document.getElementById('progressBar');

    const config = {
        rotationSpeed: 50,
        rotationDisplayTime: 4000,
        resetTime: 5000,
        adminClicksRequired: 5,
        adminClickTimeout: 3000,
        inactivityTime: 30000,
        autoSubmitCountdown: 5,
    };

    const LOCAL_STORAGE_KEY = 'surveySubmissions';
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
        // ...other questions as defined earlier
    ];

    const appState = {
        currentPage: 0,
        formData: {},
        questionRotationIndex: 0,
        typingTimeout: null,
        displayTimeout: null,
        inactivityTimeout: null,
        countdownIntervalId: null,
        isUserActive: false,
        adminClickCount: 0,
        adminTimer: null,
        stopRotationPermanently: false,
    };

    const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    const updateProgressBar = (isSubmitted = false) => {
        let progress = (appState.currentPage / surveyQuestions.length) * 100;
        if (isSubmitted) progress = 100;
        progressBar.style.width = `${progress}%`;
    };

    const resetInactivityTimer = () => {
        clearTimeout(appState.inactivityTimeout);
        if(appState.countdownIntervalId) { clearInterval(appState.countdownIntervalId); overlay.classList.add('invisible','opacity-0'); overlay.classList.remove('flex','opacity-100'); }
        appState.inactivityTimeout = setTimeout(handleInactivityTimeout, config.inactivityTime);
        appState.isUserActive = true;
    };

    const handleInactivityTimeout = () => {
        overlay.classList.remove('invisible','opacity-0'); 
        overlay.classList.add('flex','opacity-100');
        let countdown = config.autoSubmitCountdown;
        countdownSpan.textContent = countdown;
        cancelButton.classList.remove('hidden');

        appState.countdownIntervalId = setInterval(() => {
            countdown--;
            countdownSpan.textContent = countdown;
            if(countdown <=0){
                clearInterval(appState.countdownIntervalId);
                overlay.classList.add('invisible','opacity-0');
                overlay.classList.remove('flex','opacity-100');
                cancelButton.classList.add('hidden');
                submitSurvey();
            }
        },1000);
    };

    cancelButton.addEventListener('click', () => {
        clearInterval(appState.countdownIntervalId);
        overlay.classList.add('invisible','opacity-0');
        overlay.classList.remove('flex','opacity-100');
        cancelButton.classList.add('hidden');
        resetInactivityTimer();
    });

    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);

    mainTitle.addEventListener('click', () => {
        appState.adminClickCount++;
        clearTimeout(appState.adminTimer);
        appState.adminTimer = setTimeout(() => { appState.adminClickCount = 0; }, config.adminClickTimeout);
        if(appState.adminClickCount >= config.adminClicksRequired){
            adminClearButton.classList.remove('hidden');
            syncButton.classList.remove('hidden');
            hideAdminButton.classList.remove('hidden');
        }
    });

    hideAdminButton.addEventListener('click', () => {
        adminClearButton.classList.add('hidden');
        syncButton.classList.add('hidden');
        hideAdminButton.classList.add('hidden');
        appState.adminClickCount = 0;
    });

    const renderPage = (index) => {
        appState.currentPage = index;
        questionContainer.innerHTML = '';
        const q = surveyQuestions[index];
        let fieldHTML = '';

        switch(q.type){
            case 'textarea':
                fieldHTML = `
                    <label id="rotatingQuestion" for="${q.id}" class="block text-gray-700 font-semibold mb-2" aria-live="polite">${q.rotatingText[0]}</label>
                    <textarea id="${q.id}" name="${q.name}" placeholder="${q.placeholder}" required class="w-full p-3 border rounded-lg focus:ring-2 focus:ring-sewa-orange">${appState.formData[q.name] || ''}</textarea>
                `;
                break;
            case 'star':
                fieldHTML = `<div class="star-rating flex space-x-2 justify-center">`;
                for(let i=5;i>=1;i--){
                    fieldHTML += `<input type="radio" id="${q.name}_${i}" name="${q.name}" value="${i}" ${appState.formData[q.name]==i ? 'checked':''}>
                    <label for="${q.name}_${i}" class="text-3xl cursor-pointer hover:text-yellow-400">★</label>`;
                }
                fieldHTML += `</div>`;
                break;
        }

        questionContainer.innerHTML = fieldHTML;
        updateProgressBar();
        if(q.type === 'textarea') startQuestionRotation();
    };

    const rotateQuestions = () => {
        if(appState.stopRotationPermanently) return;
        const label = document.getElementById('rotatingQuestion');
        if(!label) return;
        const q = surveyQuestions[0];
        const text = q.rotatingText[appState.questionRotationIndex % q.rotatingText.length];
        let i=0;
        label.textContent = '';
        const typeLetter = () => {
            if(i<text.length){
                label.textContent += text[i];
                i++;
                appState.typingTimeout = setTimeout(typeLetter, config.rotationSpeed);
            } else {
                appState.displayTimeout = setTimeout(() => {
                    appState.questionRotationIndex++;
                    rotateQuestions();
                }, config.rotationDisplayTime);
            }
        };
        typeLetter();
    };

    const startQuestionRotation = () => {
        appState.stopRotationPermanently = false;
        rotateQuestions();
    };

    const validatePage = () => {
        const q = surveyQuestions[appState.currentPage];
        const val = document.querySelector(`[name="${q.name}"]`).value.trim();
        if(q.required && !val){
            statusMessage.textContent = 'Please answer this question.';
            statusMessage.classList.remove('hidden');
            return false;
        }
        statusMessage.classList.add('hidden');
        return true;
    };

    const saveLocal = () => {
        let data = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)||'[]');
        const currentData = {...appState.formData, timestamp: Date.now()};
        data.push(currentData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    };

    const submitSurvey = () => {
        saveLocal();
        appState.formData = {};
        renderPage(0);
        updateProgressBar(true);
    };

    nextButton.addEventListener('click', ()=>{
        if(!validatePage()) return;
        const q = surveyQuestions[appState.currentPage];
        appState.formData[q.name] = document.querySelector(`[name="${q.name}"]`).value.trim();
        if(appState.currentPage<surveyQuestions.length-1){
            renderPage(appState.currentPage+1);
        } else {
            submitSurvey();
        }
    });

    backButton.addEventListener('click', ()=>{
        if(appState.currentPage>0) renderPage(appState.currentPage-1);
    });

    renderPage(0);
    resetInactivityTimer();
});
