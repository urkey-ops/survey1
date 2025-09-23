const form = document.getElementById('surveyForm');
const statusMessage = document.getElementById('statusMessage');
const surveyPages = document.querySelectorAll('.survey-page');
const nextButton = document.getElementById('nextButton');
const backButton = document.getElementById('backButton');
const rotatingQuestionEl = document.getElementById('rotatingQuestion');

const questions = [
    "1. What did you like about your visit today?",
    "1. What could we do better during your next visit?",
    "1. Do you have any general comments or suggestions?",
    "1. What was the most memorable part of your experience?"
];

let currentPage = 0;
let questionIndex = 0;

function showPage(pageIndex) {
    surveyPages.forEach((page, index) => {
        page.classList.toggle('hidden', index !== pageIndex);
    });

    backButton.style.visibility = pageIndex === 0 ? 'hidden' : 'visible';
    if (pageIndex === surveyPages.length - 1) {
        nextButton.textContent = 'Submit Survey';
        nextButton.type = 'submit';
    } else {
        nextButton.textContent = 'Next';
        nextButton.type = 'button';
    }
}

function validatePage(pageElement) {
    const textarea = pageElement.querySelector('textarea');
    if (textarea && textarea.required && !textarea.value.trim()) {
        return false;
    }

    const radioButtons = pageElement.querySelectorAll('input[type="radio"]');
    if (radioButtons.length > 0) {
        const isChecked = Array.from(radioButtons).some(radio => radio.checked);
        if (!isChecked) {
            return false;
        }
    }
    return true;
}

let typingTimeout;
let displayTimeout;

function typeWriter(text, i, speed) {
    if (i < text.length) {
        rotatingQuestionEl.textContent += text.charAt(i);
        typingTimeout = setTimeout(() => typeWriter(text, i + 1, speed), speed);
    } else {
        displayTimeout = setTimeout(rotateQuestions, 4000);
    }
}

function rotateQuestions() {
    clearTimeout(typingTimeout);
    clearTimeout(displayTimeout);

    const currentQuestion = questions[questionIndex];
    rotatingQuestionEl.textContent = "";
    questionIndex = (questionIndex + 1) % questions.length;
    
    typeWriter(currentQuestion, 0, 50);
}

// Event listener for the "Next" button. It handles navigation only.
nextButton.addEventListener('click', () => {
    // Navigate only if not on the final page.
    if (currentPage < surveyPages.length - 1) {
        const currentPageElement = surveyPages[currentPage];
        if (validatePage(currentPageElement)) {
            statusMessage.style.display = 'none';
            currentPage++;
            showPage(currentPage);
        } else {
            statusMessage.textContent = 'Please answer the current question to continue.';
            statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-red-100 text-red-700 font-medium';
            statusMessage.style.display = 'block';
        }
    }
});

// Event listener for the "Back" button.
backButton.addEventListener('click', () => {
    if (currentPage > 0) {
        currentPage--;
        showPage(currentPage);
    }
});

// Event listener for the form submission. This runs ONLY when the nextButton's type is "submit".
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Re-validate the final page to be safe.
    const currentPageElement = surveyPages[currentPage];
    if (!validatePage(currentPageElement)) {
        statusMessage.textContent = 'Please answer the current question to continue.';
        statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-red-100 text-red-700 font-medium';
        statusMessage.style.display = 'block';
        return;
    }

    statusMessage.style.display = 'none';
    statusMessage.textContent = 'Submitting survey...';
    statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-yellow-100 text-yellow-700 font-medium';
    statusMessage.style.display = 'block';

    const formData = new FormData(form);
    const data = {
        question: rotatingQuestionEl.textContent,
        comments: formData.get('comments'),
        satisfaction: formData.get('satisfaction'),
        cleanliness: formData.get('cleanliness'),
        staff_friendliness: formData.get('staff_friendliness')
    };

    try {
        const response = await fetch('/api/submit-survey', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            statusMessage.textContent = 'Survey submitted successfully! Thank you.';
            statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-green-100 text-green-700 font-medium';
            form.reset();
            currentPage = 0;
            showPage(currentPage);
        } else {
            statusMessage.textContent = 'Error submitting survey. Please try again.';
            statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-red-100 text-red-700 font-medium';
        }
    } catch (error) {
        console.error('Network or API Error:', error);
        statusMessage.textContent = 'Error: Could not connect to the server.';
        statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-red-100 text-red-700 font-medium';
    }
});

// Initialize the survey on page load
showPage(currentPage);
rotateQuestions();
