document.addEventListener('DOMContentLoaded', () => {
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const bookingsContainer = document.getElementById('bookings-table-container');
    const whitelistContainer = document.getElementById('whitelist-container');

    const API_BASE = window.location.hostname === "https://glamour-studio-o5vi.onrender.com"
    ? "https://glamour-studio-1.onrender.com"
    : "https://glamour-studio-1.onrender.com";

    // Helper function for robust notifications
    function showNotification(title, text, icon) {
        if (typeof Swal !== 'undefined') {
            // Add theme-matching background and text color for SweetAlert
            return Swal.fire({ title, text, icon, background: 'var(--bg-surface)', color: 'var(--text-main)' });
        } else {
            // Fallback to a standard browser alert if Swal is not available
            alert(`${title}\n${text}`);
            return Promise.resolve();
        }
    }

    // --- Auth Logic ---
    
    function showLogin() {
        loginView.style.display = 'block';
        dashboardView.style.display = 'none';
        logoutBtn.style.display = 'none';
    }

    function showDashboardAndLoadData(bookings) {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        logoutBtn.style.display = 'block';

        calculateStats(bookings);
        renderBookingsTable(bookings);
        fetchWhitelist();
    }

    function showDashboard() {
        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        logoutBtn.style.display = 'block';
    }

    const loginButton = document.getElementById('login-button');
    loginButton?.addEventListener('click', async () => {
        const formData = new FormData(loginForm);
        const data = Object.fromEntries(formData.entries());
        const button = loginButton;

        // Provide immediate feedback to the user
        button.disabled = true;
        button.textContent = 'Logging in...';
        
        try {
            const loginResponse = await fetch(`${API_BASE}/api/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                credentials: 'include'
            });

            const result = await loginResponse.json();
            if (!loginResponse.ok || !result.success) {
                throw new Error(result.message || 'Invalid credentials');
            }

            // Login successful, now fetch the data for the dashboard
            const bookingsResponse = await fetch(`${API_BASE}/api/bookings`, { credentials: 'include' });
            if (!bookingsResponse.ok) {
                const errData = await bookingsResponse.json().catch(() => ({}));
                throw new Error(errData.message || 'Authentication succeeded, but failed to load dashboard data.');
            }

            const bookings = await bookingsResponse.json();
            showDashboardAndLoadData(bookings);

        } catch (error) {
            showNotification('Login Failed', error.message, 'error');
            // Re-enable the button on any failure
            if (button) {
                button.disabled = false;
                button.textContent = 'Login';
            }
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await fetch(`${API_BASE}/api/admin/logout`, { method: 'POST', credentials: 'include' });
        showLogin();
    });

    // --- Initial Page Load Check ---
    async function checkInitialAuth() {
        try {
            const response = await fetch(`${API_BASE}/api/bookings`, { credentials: 'include' });
            if (response.ok) {
                const bookings = await response.json();
                showDashboardAndLoadData(bookings);
            } else {
                showLogin();
            }
        } catch (error) {
            showLogin();
        }
    }
    checkInitialAuth();

    // --- Bookings Logic ---

    async function fetchBookings() {
        // This is now handled inside checkAuth initially, 
        // but we keep it for manual refreshes if needed.
        const response = await fetch(`${API_BASE}/api/bookings`, { credentials: 'include' });
        if (!response.ok) return; // Handled by auth check usually
        const bookings = await response.json();
        renderBookingsTable(bookings);
    }

    function renderBookingsTable(bookings) {
        if (bookings.length === 0) {
            bookingsContainer.innerHTML = '<p style="color: var(--text-muted);">No bookings found.</p>';
            return;
        }

        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Service</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${bookings.map(booking => `
                    <tr data-booking-id="${booking.id}">
                        <td>${booking.id}</td>
                        <td>${escapeHtml(booking.name)}</td>
                        <td>${escapeHtml(booking.phone)}</td>
                        <td>${booking.email ? escapeHtml(booking.email) : 'N/A'}</td>
                        <td>${escapeHtml(booking.serviceName)}</td>
                        <td>${new Date(booking.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td>${booking.time}</td>
                        <td>
                            <button class="btn-delete" data-id="${booking.id}" style="background: var(--accent-red); color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Delete</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        bookingsContainer.innerHTML = '';
        bookingsContainer.appendChild(table);
    }

    async function handleDelete(bookingId) {
        const result = await (async () => {
            if (typeof Swal !== 'undefined') {
                return Swal.fire({
                    title: 'Are you sure?',
                    text: "This booking will be permanently deleted!",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#d33',
                    cancelButtonColor: '#3085d6',
                    confirmButtonText: 'Yes, delete it!',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-main)'
                });
            }
            return { isConfirmed: confirm('Are you sure you want to delete this booking?') };
        })();

        if (result.isConfirmed) {
            try {
                const response = await fetch(`https://glamour-studio-1.onrender.com/api/bookings/${bookingId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                if (!response.ok) {
                    const resData = await response.json();
                    throw new Error(resData.message || 'Failed to delete');
                }
                showNotification('Deleted!', 'The booking has been removed.', 'success');
                checkInitialAuth(); // Re-fetch data to update stats and table
            } catch (error) {
                showNotification('Error', `Failed to delete booking: ${error.message}`, 'error');
            }
        }
    }
    
    bookingsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete')) {
            const id = e.target.dataset.id;
            handleDelete(id);
        }
    });

    // --- Whitelist Logic ---

    async function fetchWhitelist() {
        try {
            const response = await fetch(`${API_BASE}/api/whitelist`, { credentials: 'include' });
            if (!response.ok) throw new Error('Failed to fetch whitelist');
            const emails = await response.json();
            renderWhitelist(emails);
        } catch (error) {
            console.error('Error fetching whitelist:', error);
            whitelistContainer.innerHTML = '<p style="color: red;">Could not load whitelist subscribers.</p>';
        }
    }

    function renderWhitelist(emails) {
        if (emails.length === 0) {
            whitelistContainer.innerHTML = '<p style="color: var(--text-muted);">No subscribers on the whitelist yet.</p>';
            return;
        }
        whitelistContainer.innerHTML = `<ul style="list-style: none; padding: 0; columns: 2; -webkit-columns: 2; -moz-columns: 2;">${emails.map(email => `<li style="padding: 5px 0;">${escapeHtml(email)}</li>`).join('')}</ul>`;
    }

    // --- Email Logic ---
    const emailForm = document.getElementById('email-form');
    if (emailForm) {
        emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('email-subject').value;
            const message = document.getElementById('email-message').value;
            const isHtml = document.getElementById('email-is-html').checked;
            const button = emailForm.querySelector('button[type="submit"]');
            const originalText = button.textContent;

            const result = await (async () => {
                if (typeof Swal !== 'undefined') {
                    return Swal.fire({
                        title: 'Are you sure?',
                        text: "This will send an email to ALL whitelist subscribers.",
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#3085d6',
                        cancelButtonColor: '#d33',
                        confirmButtonText: 'Yes, send it!',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-main)'
                    });
                }
                return { isConfirmed: confirm('Are you sure you want to send this email to all subscribers?') };
            })();

            if (!result.isConfirmed) return;

            button.disabled = true;
            button.textContent = 'Sending...';

            try {
                const response = await fetch(`${API_BASE}/api/admin/send-whitelist-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ subject, message, isHtml }),
                    credentials: 'include'
                });

                const data = await response.json();

                if (response.ok) {
                    showNotification('Success', data.message, 'success');
                    emailForm.reset();
                } else {
                    throw new Error(data.message || 'Failed to send emails');
                }
            } catch (error) {
                showNotification('Error', error.message, 'error');
            } finally {
                button.disabled = false;
                button.textContent = originalText;
            }
        });
    }

    // --- Stats Logic ---
    function calculateStats(bookings) {
        const totalBookingsEl = document.getElementById('stats-total-bookings');
        const upcomingBookingsEl = document.getElementById('stats-upcoming-bookings');
        const totalRevenueEl = document.getElementById('stats-total-revenue');

        const totalBookings = bookings.length;
        const totalRevenue = bookings.reduce((sum, booking) => sum + (booking.price || 0), 0);
        
        const now = new Date();
        const upcomingBookings = bookings.filter(b => new Date(`${b.date}T${b.time}`) >= now).length;

        totalBookingsEl.textContent = totalBookings;
        upcomingBookingsEl.textContent = upcomingBookings;
        totalRevenueEl.textContent = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0
        }).format(totalRevenue);
    }

    function escapeHtml(str) { return String(str).replace(/[&<>"']/g, s => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[s]); }

});