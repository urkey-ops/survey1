<script>
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

        // Update navigation buttons
        backButton.style.visibility = pageIndex === 0 ? 'hidden' : 'visible';
        if (pageIndex === surveyPages.length - 1) {
            nextButton.textContent = 'Submit Survey';
        } else {
            nextButton.textContent = 'Next';
        }
    }

    function validatePage(pageElement) {
        // Check for textarea validation
        const textarea = pageElement.querySelector('textarea');
        if (textarea && textarea.required && !textarea.value.trim()) {
            return false;
        }

        // Check for radio button validation
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
            // Once typing is complete, show the full question for 4 seconds
            displayTimeout = setTimeout(rotateQuestions, 4000);
        }
    }

    function rotateQuestions() {
        // Clear any previous timeouts to prevent overlap
        clearTimeout(typingTimeout);
        clearTimeout(displayTimeout);

        // Get the current question and reset the element's text
        const currentQuestion = questions[questionIndex];
        rotatingQuestionEl.textContent = "";
        questionIndex = (questionIndex + 1) % questions.length;
        
        // Start the typing effect
        typeWriter(currentQuestion, 0, 50); // 50ms per character
    }

    // Add event listeners for navigation
    nextButton.addEventListener('click', () => {
        const currentPageElement = surveyPages[currentPage];
        if (!validatePage(currentPageElement)) {
            statusMessage.textContent = 'Please answer the current question to continue.';
            statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-red-100 text-red-700 font-medium';
            statusMessage.style.display = 'block';
            return;
        }
        statusMessage.style.display = 'none'; // Hide message on success

        if (currentPage < surveyPages.length - 1) {
            currentPage++;
            showPage(currentPage);
        } else {
            // This is the last page, so we submit the form
            form.submit();
        }
    });

    backButton.addEventListener('click', () => {
        if (currentPage > 0) {
            currentPage--;
            showPage(currentPage);
        }
    });

    // Handle the final form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Clear any previous messages
        statusMessage.style.display = 'none';

        // Collect data from all form fields
        const formData = new FormData(form);
        const data = {
            question: "How was your visit?",
            comments: formData.get('comments'),
            satisfaction: formData.get('satisfaction'),
            cleanliness: formData.get('cleanliness'),
            staff_friendliness: formData.get('staff_friendliness')
        };

        statusMessage.textContent = 'Submitting survey...';
        statusMessage.className = 'block p-4 mb-4 rounded-xl text-center bg-yellow-100 text-yellow-700 font-medium';
        statusMessage.style.display = 'block';

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
                currentPage = 0; // Reset survey to the first page
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
    rotateQuestions(); // Start the first question cycle
</script>
