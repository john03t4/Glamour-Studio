document.addEventListener('DOMContentLoaded', () => {
    const serviceSelect = document.getElementById('service-select');
    const dateInput = document.getElementById('booking-date');
    const slotsContainer = document.getElementById('slots-container');
    const selectedTimeInput = document.getElementById('selected-time');
    const bookingForm = document.getElementById('booking-form');

    // Helper function to handle notifications safely
    function showNotification(title, text, icon) {
        if (typeof Swal !== 'undefined') {
            return Swal.fire(title, text, icon);
        } else {
            alert(`${title}\n${text}`);
            return Promise.resolve();
        }
    }

    // Set minimum date to today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateInput.setAttribute('min', today.toISOString().split('T')[0]);

    // 1. Fetch and populate services
    async function populateServices() {
        try {
            const response = await fetch('http://localhost:3000/api/services');
            const services = await response.json();

            serviceSelect.innerHTML = '<option value="">-- Select a Service --</option>';
            services.forEach(service => {
                const option = document.createElement('option');
                option.value = service.id;
                option.textContent = `${service.name} (${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(service.price)})`;
                serviceSelect.appendChild(option);
            });

            // 2. Check for serviceId in URL and pre-select
            const urlParams = new URLSearchParams(window.location.search);
            const serviceIdFromUrl = urlParams.get('serviceId');
            if (serviceIdFromUrl) {
                serviceSelect.value = serviceIdFromUrl;
                // Automatically trigger change to load availability if date is also set
                if (dateInput.value) {
                    fetchAvailability();
                }
            }
        } catch (error) {
            console.error('Error loading services:', error);
            serviceSelect.innerHTML = '<option value="">Could not load services</option>';
        }
    }

    // 3. Fetch availability
    async function fetchAvailability() {
        const serviceId = serviceSelect.value;
        const date = dateInput.value;

        if (!serviceId || !date) {
            slotsContainer.innerHTML = '<p style="color: var(--text-muted);">Please select a service and date first.</p>';
            return;
        }

        slotsContainer.innerHTML = '<p style="color: var(--text-muted);">Checking availability...</p>';

        try {
            const response = await fetch(`http://localhost:3000/api/availability?serviceId=${serviceId}&date=${date}`);
            const slots = await response.json();
            renderSlots(slots);
        } catch (error) {
            console.error('Error fetching availability:', error);
            slotsContainer.innerHTML = '<p style="color: red;">Could not fetch time slots. Please try again.</p>';
        }
    }

    // Render time slots
    function renderSlots(slots) {
        slotsContainer.innerHTML = '';
        if (slots.length === 0) {
            slotsContainer.innerHTML = '<p style="color: var(--text-muted);">No available slots for this day. Please try another date.</p>';
            return;
        }

        slots.forEach(slot => {
            const slotElement = document.createElement('div');
            slotElement.className = 'time-slot';
            slotElement.textContent = slot;
            slotElement.dataset.time = slot;
            slotsContainer.appendChild(slotElement);
        });
    }

    // 4. Handle time slot selection
    slotsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('time-slot')) {
            const currentlySelected = slotsContainer.querySelector('.selected');
            if (currentlySelected) {
                currentlySelected.classList.remove('selected');
            }
            e.target.classList.add('selected');
            selectedTimeInput.value = e.target.dataset.time;
        }
    });

    // 5. Handle form submission
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedTimeInput.value) {
            showNotification('Incomplete', 'Please select a time slot.', 'warning');
            return;
        }

        const formData = new FormData(bookingForm);
        const data = Object.fromEntries(formData.entries());
        const button = bookingForm.querySelector('button[type="submit"]');
        button.disabled = true;
        button.textContent = 'Booking...';

        try {
            const response = await fetch('http://localhost:3000/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            let result;
            try {
                result = await response.json();
            } catch (err) {
                throw new Error('Invalid server response');
            }

            if (response.ok) {
                showNotification('Booking Successful!', `Your appointment is confirmed.`, 'success').then(() => {
                    bookingForm.reset();
                    slotsContainer.innerHTML = '<p style="color: var(--text-muted);">Please select a service and date first.</p>';
                    selectedTimeInput.value = '';
                    const selected = slotsContainer.querySelector('.selected');
                    if (selected) selected.classList.remove('selected');
                });
            } else {
                showNotification('Booking Failed', result.message || 'An unknown error occurred.', 'error');
            }
        } catch (error) {
            console.error('Booking Error:', error);
            showNotification('Error', 'Could not submit booking. Please try again later.', 'error');
        } finally {
            button.disabled = false;
            button.textContent = 'Confirm Booking';
        }
    });

    serviceSelect.addEventListener('change', fetchAvailability);
    dateInput.addEventListener('change', fetchAvailability);
    populateServices();
});