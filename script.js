document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('whitelist-form');

    // This script might be used on multiple pages, so we check if the form exists.
    if (form) {
        form.addEventListener('submit', async function(event) {
            event.preventDefault();

            const emailInput = form.querySelector('input[type="email"]');
            const button = form.querySelector('button[type="submit"]');
            const email = emailInput.value;
            const originalButtonText = button.textContent;

            button.disabled = true;
            button.textContent = 'Joining...';

            try {
                const response = await fetch('https://glamour-studio-1.onrender.com/api/whitelist', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email: email }),
                });

                const result = await response.json();

                if (response.ok) {
                    Swal.fire({
                        title: 'Success!',
                        text: result.message,
                        icon: 'success',
                        confirmButtonText: 'Awesome'
                    });
                    emailInput.value = ''; // Clear input on success
                } else {
                    Swal.fire({
                        title: 'Error!',
                        text: result.message,
                        icon: 'error',
                        confirmButtonText: 'Try Again'
                    });
                }
            } catch (error) {
                console.error('Whitelist submission error:', error);
                Swal.fire({
                    title: 'Error!',
                    text: 'An error occurred. Please try again later.',
                    icon: 'error',
                    confirmButtonText: 'Close'
                });
            } finally {
                button.disabled = false;
                button.textContent = originalButtonText;
            }
        });
    }
});