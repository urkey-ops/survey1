// --- data-util.js ---
window.dataUtils = (function() {

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
        {
            id: 'satisfaction',
            name: 'satisfaction',
            type: 'emoji-radio',
            question: '2. Overall, how satisfied were you with your visit today?',
            options: [
                { value: 'Sad', label: 'Sad', emoji: '😞' },
                { value: 'Neutral', label: 'Neutral', emoji: '😐' },
                { value: 'Happy', label: 'Happy', emoji: '😊' }
            ],
            required: true
        },
        {
            id: 'cleanliness',
            name: 'cleanliness',
            type: 'number-scale',
            question: '3. How would you rate the cleanliness of the facility?',
            min: 1,
            max: 5,
            labels: { min: '1 (Poor)', max: '5 (Excellent)' },
            required: true
        },
        {
            id: 'staff_friendliness',
            name: 'staff_friendliness',
            type: 'star-rating',
            question: '4. How friendly was the volunteer staff?',
            min: 1,
            max: 5,
            required: true
        },
        {
            id: 'location',
            name: 'location',
            type: 'radio-with-other',
            question: 'Where are you visiting from today?',
            options: [
                { value: 'Lilburn/Gwinnett County', label: 'Lilburn/Gwinnett County' },
                { value: 'Greater Atlanta Area', label: 'Greater Atlanta Area' },
                { value: 'Georgia (outside Atlanta)', label: 'Georgia (outside GA)' },
                { value: 'United States (outside GA)', label: 'United States (outside GA)' },
                { value: 'Canada', label: 'Canada' },
                { value: 'India', label: 'India' },
                { value: 'Other', label: 'Other' }
            ],
            required: true
        },
        {
            id: 'age',
            name: 'age',
            type: 'radio',
            question: 'Which age group do you belong to?',
            options: [
                { value: 'Under 18', label: 'Under 18' },
                { value: '18-40', label: '18-40' },
                { value: '40-65', label: '40-65' },
                { value: '65+', label: '65+' },
            ],
            required: true
        },
        {
            id: 'contact',
            name: 'contact',
            type: 'custom-contact',
            question: 'Help us stay in touch.',
            required: true
        }
    ];

    const questionRenderers = {

        'textarea': {
            render: (q, data) => `
                <label id="rotatingQuestion" for="${q.id}" class="block text-gray-700 font-semibold mb-2" aria-live="polite">${q.question}</label>
                <textarea id="${q.id}" name="${q.name}" rows="4" class="shadow-sm resize-none appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="${q.placeholder}" required>${data[q.name] || ''}</textarea>
                <span id="${q.id}Error" class="error-message hidden"></span>`,
            setupEvents: () => {}
        },

        'emoji-radio': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="emoji-radio-group flex justify-around items-center space-x-4" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${q.options.map(opt => `
                        <input type="radio" id="${q.id + opt.value}" name="${q.name}" value="${opt.value}" class="visually-hidden" ${data[q.name] === opt.value ? 'checked' : ''}>
                        <label for="${q.id + opt.value}" class="flex flex-col items-center p-4 sm:p-6 bg-white border-2 border-transparent rounded-full hover:bg-gray-50 transition-all duration-300 cursor-pointer">
                            <span class="text-4xl sm:text-5xl mb-2">${opt.emoji}</span>
                            <span class="text-sm font-medium text-gray-600">${opt.label}</span>
                        </label>
                    `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                    radio.addEventListener('change', e => {
                        appState.formData[q.name] = e.target.value;
                        setTimeout(() => handleNextQuestion(), 50);
                    });
                });
            }
        },

        'number-scale': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="number-scale-group grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${Array.from({ length: q.max }, (_, i) => i + 1).map(num => `
                        <input type="radio" id="${q.id + num}" name="${q.name}" value="${num}" class="visually-hidden" ${parseInt(data[q.name]) === num ? 'checked' : ''}>
                        <label for="${q.id + num}" class="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 bg-white border-2 border-transparent rounded-full font-bold text-gray-700 hover:bg-gray-50"><span>${num}</span></label>
                    `).join('')}
                </div>
                <div class="flex justify-between text-sm mt-2 text-gray-500"><span>${q.labels.min}</span><span>${q.labels.max}</span></div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                    radio.addEventListener('change', e => {
                        appState.formData[q.name] = e.target.value;
                        setTimeout(() => handleNextQuestion(), 50);
                    });
                });
            }
        },

        'star-rating': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="star-rating flex flex-row-reverse justify-center mt-2" role="radiogroup" aria-labelledby="${q.id}Label">
                        ${Array.from({ length: q.max }, (_, i) => q.max - i).map(num => `
                            <input type="radio" id="${q.id + num}" name="${q.name}" value="${num}" class="visually-hidden" ${parseInt(data[q.name]) === num ? 'checked' : ''}>
                            <label for="${q.id + num}" class="star text-4xl sm:text-5xl pr-1 cursor-pointer">★</label>
                        `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                    radio.addEventListener('change', e => {
                        appState.formData[q.name] = e.target.value;
                        setTimeout(() => handleNextQuestion(), 50);
                    });
                });
            }
        },

        'radio-with-other': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="location-radio-group grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${q.options.map(opt => `
                        <input type="radio" id="${q.id + opt.value}" name="${q.name}" value="${opt.value}" class="visually-hidden" ${data[q.name] === opt.value ? 'checked' : ''}>
                        <label for="${q.id + opt.value}" class="px-3 py-3 text-center text-sm sm:text-base font-medium border-2 border-gray-300 rounded-lg">${opt.label}</label>
                    `).join('')}
                </div>
                <div id="other-location-container" class="mt-4 ${data[q.name] === 'Other' ? '' : 'hidden'}">
                    <input type="text" id="other_location_text" name="other_location" class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" placeholder="Please specify" value="${data['other_location'] || ''}">
                    <span id="other_location_textError" class="error-message hidden mt-1"></span>
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                    radio.addEventListener('change', e => {
                        appState.formData[q.name] = e.target.value;
                        const otherContainer = document.getElementById('other-location-container');
                        if (e.target.value === 'Other') {
                            otherContainer.classList.remove('hidden');
                        } else {
                            otherContainer.classList.add('hidden');
                            const otherInput = otherContainer.querySelector('input');
                            if (otherInput) otherInput.value = '';
                            delete appState.formData['other_location'];
                            setTimeout(() => handleNextQuestion(), 50);
                        }
                    });
                });
            }
        },

        'radio': {
            render: (q, data) => `
                <label id="${q.id}Label" class="block text-gray-700 font-semibold mb-2">${q.question}</label>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-labelledby="${q.id}Label">
                    ${q.options.map(opt => `
                        <input type="radio" id="${q.id + opt.value}" name="${q.name}" value="${opt.value}" class="visually-hidden" ${data[q.name] === opt.value ? 'checked' : ''}>
                        <label for="${q.id + opt.value}" class="px-3 py-3 text-center text-sm sm:text-base font-medium border-2 border-gray-300 rounded-lg">${opt.label}</label>
                    `).join('')}
                </div>
                <span id="${q.id}Error" class="error-message hidden mt-2 block"></span>`,
            setupEvents: (q, { handleNextQuestion }) => {
                document.querySelectorAll(`input[name="${q.name}"]`).forEach(radio => {
                    radio.addEventListener('change', e => {
                        appState.formData[q.name] = e.target.value;
                        setTimeout(() => handleNextQuestion(), 50);
                    });
                });
            }
        },

        'custom-contact': {
            render: (q, data) => {
                const isChecked = data['newsletterConsent'] === 'Yes';
                return `
                <div class="space-y-4">
                    <div>
                        <label for="name" class="block text-gray-700 font-semibold mb-2">Name</label>
                        <input type="text" id="name" name="name" class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" placeholder="Enter your name" value="${data['name'] || ''}">
                        <span id="nameError" class="error-message hidden"></span>
                    </div>
                    <div class="flex items-center">
                        <input type="checkbox" id="newsletterConsent" name="newsletterConsent" value="Yes" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" ${isChecked ? 'checked' : ''}>
                        <label for="newsletterConsent" class="ml-2 block text-gray-700">Yes, I want to subscribe to updates</label>
                    </div>
                    <div id="email-field-container" class="${isChecked ? 'visible-fields' : 'hidden-fields'}">
                        <label for="email" class="block text-gray-700 font-semibold mb-2">Email</label>
                        <input type="email" id="email" name="email" class="shadow-sm border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700" placeholder="Enter your email" value="${data['email'] || ''}">
                        <span id="emailError" class="error-message hidden"></span>
                    </div>
                </div>`;
            },
            setupEvents: () => {
                const checkbox = document.getElementById('newsletterConsent');
                checkbox.addEventListener('change', (e) => {
                    const emailContainer = document.getElementById('email-field-container');
                    const emailInput = document.getElementById('email');
                    if (e.target.checked) {
                        emailContainer.classList.remove('hidden-fields');
                        emailContainer.classList.add('visible-fields');
                        emailInput.setAttribute('required', 'required');
                    } else {
                        emailContainer.classList.remove('visible-fields');
                        emailContainer.classList.add('hidden-fields');
                        emailInput.removeAttribute('required');
                        emailInput.value = '';
                        delete appState.formData['email'];
                    }
                });
            }
        }
    };

    return { surveyQuestions, questionRenderers };
})();
