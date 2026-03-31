// Configuración de la API (Cloudflare Worker URL)
const API_URL = 'https://p2p-exchange-worker.jarcvon.workers.dev';

// ==================== Utility Functions ====================
function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    if (isError) {
        notification.classList.add('error');
    } else {
        notification.classList.remove('error');
    }
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ==================== Form Switching ====================
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterBtn = document.getElementById('showRegister');
const showLoginBtn = document.getElementById('showLogin');

showRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
});

showLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
});

// ==================== Login ====================
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        showNotification('Por favor completa todos los campos', true);
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Guardar token en localStorage
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            showNotification('¡Bienvenido!');
            
            // Redirigir al dashboard
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);
        } else {
            showNotification(data.error || 'Error al iniciar sesión', true);
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión. Verifica tu configuración.', true);
    }
});

// ==================== Register ====================
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('reg-username').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const whatsapp = document.getElementById('reg-whatsapp').value.trim();
    const password = document.getElementById('reg-password').value;
    const binanceWallet = document.getElementById('reg-binance').value.trim();
    
    if (!username || !name || !whatsapp || !password) {
        showNotification('Por favor completa todos los campos obligatorios', true);
        return;
    }
    
    // Validar formato de WhatsApp
    if (!whatsapp.startsWith('+')) {
        showNotification('El número de WhatsApp debe incluir el código de país (ej: +57)', true);
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                name,
                whatsapp,
                password,
                binanceWallet
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showNotification('¡Cuenta creada! Ahora puedes iniciar sesión');
            
            // Cambiar al formulario de login después de 1.5 segundos
            setTimeout(() => {
                registerForm.classList.remove('active');
                loginForm.classList.add('active');
                
                // Pre-llenar el username en el login
                document.getElementById('login-username').value = username;
            }, 1500);
        } else {
            showNotification(data.error || 'Error al crear la cuenta', true);
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión. Verifica tu configuración.', true);
    }
});
