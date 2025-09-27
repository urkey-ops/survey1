// --- data-util.js (Reverted to Original Questions) ---

// 1. QUESTION DATA STRUCTURE
const surveyQuestions = [
    {
        id: 'q1',
        name: 'location',
        type: 'radio-with-other',
        title: 'Where did you hear about us?',
        required: true,
        options: [
            { label: 'Social Media', value: 'Social Media' },
            { label: 'Retail Location', value: 'Retail Location' },
            { label: 'Friend/Family', value: 'Friend/Family' },
            { label: 'Other', value: 'Other' } // Special value for custom input
        ]
    },
    {
        id: 'q2',
        name: 'satisfaction',
        type: 'rating-scale',
        title: 'How satisfied were you with your visit today?',
        required: true,
        scale: 5, // 1 (Very Dissatisfied) to 5 (Very Satisfied)
        labels: ['Very Dissatisfied', 'Very Satisfied']
    },
    {
        id: 'q3',
        name: 'serviceSpeed',
        type: 'rating-scale',
        title: 'How would you rate the speed of service?',
        required: true,
        scale: 4, // 1 (Too Slow) to 4 (Very Fast)
        labels: ['Too Slow', 'Very Fast']
    },
    {
        id: 'q4',
        name: 'additionalComments',
        type: 'textarea',
        title: 'Do you have any additional comments or suggestions?',
        required: false
    },
    {
        id: 'q5',
        name: 'contactInfo',
        type: 'custom-contact',
        title: 'Stay in Touch',
        rotatingText: ['Tell us what you think!', 'Join our newsletter!', 'Get exclusive offers!'],
        required: false // Fields inside are only required if consent is given
    }
];


// 2. RENDERER LOGIC FOR EACH QUESTION TYPE

const questionRenderers = {
    
    // --- RATING SCALE RENDERER (q2, q3) ---
    'rating-scale': {
        render: (q, formData) => {
            const currentValue = formData[q.name] || 0;
            const optionsHtml = Array.from({ length: q.scale }, (_, i) => {
                const value = i + 1;
                const isChecked = currentValue == value;
                return `
                    <div class="flex flex-col items-center">
                        <input type="radio" id="${q.name}_${value}" name="${q.name}" value="${value}" ${isChecked ? 'checked' : ''} class="hidden rating-input">
                        <label for="${q.name}_${value}" class="w-12 h-12 flex items-center justify-center border-2 border-gray-300 rounded-full text-lg font-bold cursor-pointer transition-colors duration-200 
                            ${isChecked ? 'bg-sewa-orange text-white border-sewa-orange shadow-md' : 'bg-white text-gray-700 hover:bg-gray-100'}"
                        >
                            ${value}
                        </label>
                    </div>
                `;
            }).join('');

            return `
                <h2 class="text-2xl font-semibold text-gray-800 mb-6">${q.title}</h2>
                <div class="flex justify-between items-center my-4">
                    <span class="text-sm text-gray-500">${q.labels[0]}</span>
                    <span class="text-sm text-gray-500">${q.labels[1]}</span>
                </div>
                <div id="${q.id}" class="flex justify-between items-center space-x-2">
                    ${optionsHtml}
                </div>
                <div id="${q.id}Error" class="error-message text-red-500 text-sm mt-2 hidden"></div>
            `;
        },
        setupEvents: (q, handlers) => {
            document.querySelectorAll(`input[name="${q.name}"]`).forEach(input => {
                input.addEventListener('change', (e) => {
                    handlers.updateData(q.name, e.target.value);
                    // Optional: Auto-advance after selection
                    // handlers.handleNextQuestion();
                });
            });
        }
    },

    // --- RADIO WITH 'OTHER' TEXT INPUT RENDERER (q1) ---
    'radio-with-other': {
        render: (q, formData) => {
            const currentValue = formData[q.name] || '';
            const otherValue = formData['other_location'] || '';
            const isOtherChecked = currentValue === 'Other';
            
            const optionsHtml = q.options.map(option => {
                const isChecked = currentValue === option.value;
                return `
                    <div class="flex items-center">
                        <input id="${q.name}_${option.value}" name="${q.name}" type="radio" value="${option.value}" ${isChecked ? 'checked' : ''} class="w-4 h-4 text-sewa-orange focus:ring-sewa-orange border-gray-300">
                        <label for="${q.name}_${option.value}" class="ml-3 block text-base font-medium text-gray-700">${option.label}</label>
                    </div>
                `;
            }).join('');

            return `
                <h2 class="text-2xl font-semibold text-gray-800 mb-6">${q.title}</h2>
                <div id="${q.id}" class="space-y-4">
                    ${optionsHtml}
                    
                    <div id="other-input-container" class="mt-2 pl-6 ${isOtherChecked ? '' : 'hidden'}">
                        <input id="other_location_text" name="other_location" type="text" value="${otherValue}" placeholder="Please specify" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-sewa-orange focus:border-sewa-orange">
                        <div id="other_location_textError" class="error-message text-red-500 text-sm mt-1 hidden"></div>
                    </div>
                </div>
                <div id="${q.id}Error" class="error-message text-red-500 text-sm mt-4 hidden"></div>
            `;
        },
        setupEvents: (q, handlers) => {
            const otherContainer = document.getElementById('other-input-container');
            const otherInput = document.getElementById('other_location_text');

            document.querySelectorAll(`input[name="${q.name}"]`).forEach(input => {
                input.addEventListener('change', (e) => {
                    const value = e.target.value;
                    handlers.updateData(q.name, value);
                    
                    if (value === 'Other') {
                        otherContainer.classList.remove('hidden');
                        otherInput.focus();
                    } else {
                        otherContainer.classList.add('hidden');
                        handlers.updateData('other_location', ''); // Clear 'other' data if a standard radio is selected
                    }
                });
            });

            if (otherInput) {
                otherInput.addEventListener('input', (e) => {
                    handlers.updateData('other_location', e.target.value);
                });
            }
        }
    },

    // --- TEXTAREA RENDERER (q4) ---
    'textarea': {
        render: (q, formData) => {
            const currentValue = formData[q.name] || '';
            return `
                <h2 class="text-2xl font-semibold text-gray-800 mb-6">${q.title}</h2>
                <textarea id="${q.name}_input" name="${q.name}" rows="5" placeholder="Enter your comments here..." class="block w-full border border-gray-300 rounded-lg shadow-sm p-4 focus:ring-sewa-orange focus:border-sewa-orange">${currentValue}</textarea>
                <div id="${q.id}Error" class="error-message text-red-500 text-sm mt-2 hidden"></div>
            `;
        },
        setupEvents: (q, handlers) => {
            const input = document.getElementById(`${q.name}_input`);
            if (input) {
                input.addEventListener('input', (e) => {
                    handlers.updateData(q.name, e.target.value);
                });
            }
        }
    },

    // --- CUSTOM CONTACT RENDERER (q5) ---
    'custom-contact': {
        render: (q, formData) => {
            const consent = formData['newsletterConsent'] === 'Yes';
            const name = formData['name'] || '';
            const email = formData['email'] || '';

            return `
                <h2 class="text-2xl font-semibold text-gray-800 mb-2">${q.title}</h2>
                <p id="rotatingQuestion" class="text-lg text-gray-600 mb-6">${q.rotatingText[0]}</p>

                <div class="flex items-center space-x-3 mb-6">
                    <input id="consent_checkbox" type="checkbox" name="newsletterConsent" value="Yes" ${consent ? 'checked' : ''} class="w-5 h-5 text-sewa-orange focus:ring-sewa-orange border-gray-300 rounded">
                    <label for="consent_checkbox" class="text-base font-medium text-gray-700">I would like to receive updates and promotions.</label>
                </div>
                
                <div id="contact_fields" class="space-y-4 p-4 border rounded-lg ${consent ? 'border-sewa-orange' : 'border-gray-200'}">
                    <div class="form-group">
                        <label for="name_input" class="block text-sm font-medium text-gray-700">Name (Required if consenting)</label>
                        <input id="name_input" name="name" type="text" value="${name}" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-sewa-orange focus:border-sewa-orange" ${consent ? '' : 'disabled'}>
                        <div id="nameError" class="error-message text-red-500 text-sm mt-1 hidden"></div>
                    </div>

                    <div class="form-group">
                        <label for="email_input" class="block text-sm font-medium text-gray-700">Email (Required if consenting)</label>
                        <input id="email_input" name="email" type="email" value="${email}" class="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-sewa-orange focus:border-sewa-orange" ${consent ? '' : 'disabled'}>
                        <div id="emailError" class="error-message text-red-500 text-sm mt-1 hidden"></div>
                    </div>
                </div>
                <div id="${q.id}Error" class="error-message text-red-500 text-sm mt-4 hidden"></div>
            `;
        },
        setupEvents: (q, handlers) => {
            const consentCheckbox = document.getElementById('consent_checkbox');
            const contactFields = document.getElementById('contact_fields');
            const nameInput = document.getElementById('name_input');
            const emailInput = document.getElementById('email_input');

            const toggleFields = (isConsent) => {
                if (isConsent) {
                    contactFields.classList.add('border-sewa-orange');
                    contactFields.classList.remove('border-gray-200');
                    nameInput.disabled = false;
                    emailInput.disabled = false;
                } else {
                    contactFields.classList.add('border-gray-200');
                    contactFields.classList.remove('border-sewa-orange');
                    nameInput.disabled = true;
                    emailInput.disabled = true;
                    // Clear data if consent is revoked
                    handlers.updateData('name', '');
                    handlers.updateData('email', '');
                }
            };

            // 1. Consent Checkbox Event
            consentCheckbox.addEventListener('change', (e) => {
                const isConsent = e.target.checked;
                handlers.updateData('newsletterConsent', isConsent ? 'Yes' : 'No');
                toggleFields(isConsent);
            });

            // 2. Input Events
            nameInput.addEventListener('input', (e) => handlers.updateData('name', e.target.value));
            emailInput.addEventListener('input', (e) => handlers.updateData('email', e.target.value));
        }
    }
};


// Export the data and renderers globally for survey-app.js to use
window.dataUtils = {
    surveyQuestions,
    questionRenderers
};
