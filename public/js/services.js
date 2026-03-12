document.addEventListener('DOMContentLoaded', () => {
    const servicesContainer = document.getElementById('services-container');

    // Only attempt to fetch if the container exists on the current page
    if (servicesContainer) {
        fetchServices();
    }
});

async function fetchServices() {
    try {
        const response = await fetch('https://glamour-studio-1.onrender.com/api/services');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const services = await response.json();
        renderServices(services);
    } catch (error) {
        console.error('Error loading services:', error);
        const container = document.getElementById('services-container');
        if (container) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Unable to load services. Please try again later.</p>';
        }
    }
}

function renderServices(services) {
    const container = document.getElementById('services-container');
    container.innerHTML = ''; // Clear loading indicator

    services.forEach((service, index) => {
        const card = document.createElement('div');
        // Reusing 'feature-card' class from index.html for consistent styling
        card.className = 'feature-card animate-fade-up';
        card.style.animationDelay = `${index * 0.1}s`; // Stagger animations
        
        // Format price (NGN)
        const formattedPrice = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0
        }).format(service.price);

        // Format duration
        const hours = Math.floor(service.duration / 60);
        const minutes = service.duration % 60;
        const durationText = `${hours > 0 ? hours + ' hr ' : ''}${minutes > 0 ? minutes + ' min' : ''}`.trim();

        card.innerHTML = `
            <h3>${service.name}</h3>
            <p style="color: var(--primary-gold); font-weight: bold; font-size: 1.2rem; margin: 0.5rem 0;">${formattedPrice}</p>
            <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Duration: ${durationText}</p>
            <a href="/book?serviceId=${service.id}" class="btn-primary" style="display: block; text-align: center; text-decoration: none;">Book Appointment</a>
        `;

        container.appendChild(card);
    });
}