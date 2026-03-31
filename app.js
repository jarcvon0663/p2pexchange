// Configuración de la API
const API_URL = 'https://p2p-exchange-worker.jarcvon.workers.dev';

// ==================== Auth Check ====================
const token = localStorage.getItem('token');
const user = normalizeUser(JSON.parse(localStorage.getItem('user') || '{}'));

if (!token) {
    window.location.href = 'index.html';
}

// ==================== State ====================
let currentFilter = 'buy'; // 'buy' o 'sell'
let currentPrice = 0;
let allAds = [];

// ==================== Helpers ====================
function normalizeUser(u = {}) {
    return {
        id: u.id || '',
        username: u.username || '',
        name: u.name || '',
        whatsapp: u.whatsapp || '',
        binanceWallet: u.binanceWallet || u.binance_wallet || ''
    };
}

function normalizeAd(ad = {}) {
    return {
        id: ad.id || '',
        userId: ad.userId || ad.user_id || '',
        userName: ad.userName || ad.user_name || '',
        userWhatsapp: ad.userWhatsapp || ad.user_whatsapp || '',
        type: ad.type || '',
        amount: Number(ad.amount || 0),
        margin: Number(ad.margin || 0),
        paymentMethod: ad.paymentMethod || ad.payment_method || '',
        accountNumber: ad.accountNumber || ad.account_number || '',
        binanceWallet: ad.binanceWallet || ad.binance_wallet || '',
        createdAt: ad.createdAt || ad.created_at || '',
        active: Number(ad.active ?? 1)
    };
}

function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    if (!notification) return;

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

function formatNumber(number) {
    return new Intl.NumberFormat('es-CO').format(number);
}

function safeUpper(value) {
    return String(value || '').toUpperCase();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// ==================== Price Fetching ====================
// Fuente más estable para entorno local. USD/COP sirve como base para el precio referencial.
async function fetchCurrentPrice() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cop');
        const data = await response.json();
        currentPrice = data.tether.cop;

        document.getElementById('current-price').textContent = `$${formatNumber(currentPrice.toFixed(0))}`;
        updatePricePreview();
    } catch (error) {
        console.error('Error fetching price:', error);
        document.getElementById('current-price').textContent = 'Error';
    }
}

fetchCurrentPrice();
setInterval(fetchCurrentPrice, 30000);

// ==================== Load Ads ====================
async function loadAds() {
    try {
        const response = await fetch(`${API_URL}/ads`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'index.html';
            return;
        }

        const data = await response.json();
        allAds = (data.ads || []).map(normalizeAd);
        renderAds();
    } catch (error) {
        console.error('Error loading ads:', error);
        showNotification('Error al cargar anuncios', true);
    }
}

// ==================== Render Ads ====================
function renderAds() {
    const container = document.getElementById('adsContainer');
    const emptyState = document.getElementById('emptyState');

    if (!container || !emptyState) return;

    const filteredAds = allAds.filter(ad => {
        const isMine = ad.userId && user.id && ad.userId === user.id;

        if (currentFilter === 'buy') {
            return ad.type === 'sell' && !isMine && ad.active === 1;
        } else {
            return ad.type === 'buy' && !isMine && ad.active === 1;
        }
    });

    if (filteredAds.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    container.innerHTML = filteredAds.map(ad => {
        const priceWithMargin = currentPrice * (1 + ad.margin / 100);
        const totalCOP = ad.amount * priceWithMargin;
        const paymentMethodLabel = safeUpper(ad.paymentMethod);
        const userName = escapeHtml(ad.userName || 'Usuario');
        const userWhatsapp = escapeHtml(ad.userWhatsapp || '');

        return `
            <div class="ad-card">
                <div class="ad-header">
                    <div class="ad-type-badge ${escapeHtml(ad.type)}">
                        ${ad.type === 'sell' ? '↓ Vende' : '↑ Compra'} USDT
                    </div>
                    <div class="ad-user">${userName}</div>
                </div>

                <div class="ad-body">
                    <div class="ad-amount">
                        <span class="ad-amount-value">${formatNumber(ad.amount)}</span>
                        <span class="ad-amount-currency">USDT</span>
                    </div>

                    <div class="ad-price-info">
                        <div class="price-item">
                            <span>Precio por USDT</span>
                            <strong class="highlight">$${formatNumber(priceWithMargin.toFixed(0))} COP</strong>
                        </div>
                        <div class="price-item">
                            <span>Margen</span>
                            <strong>${ad.margin > 0 ? '+' : ''}${ad.margin}%</strong>
                        </div>
                    </div>

                    <div class="ad-payment-info">
                        ${ad.type === 'sell' ? `
                            <div class="payment-row">
                                <span class="label">Recibe en:</span>
                                <span class="value">${paymentMethodLabel || 'NO ESPECIFICADO'}</span>
                            </div>
                            <div class="payment-row">
                                <span class="label">Cuenta:</span>
                                <span class="value">${escapeHtml(ad.accountNumber || 'No especificada')}</span>
                            </div>
                        ` : `
                            <div class="payment-row">
                                <span class="label">Paga con:</span>
                                <span class="value">${paymentMethodLabel || 'NO ESPECIFICADO'}</span>
                            </div>
                            <div class="payment-row">
                                <span class="label">Wallet Binance:</span>
                                <span class="value">${escapeHtml(ad.binanceWallet || 'No especificado')}</span>
                            </div>
                        `}
                        <div class="payment-row">
                            <span class="label">Total:</span>
                            <strong class="value">$${formatNumber(totalCOP.toFixed(0))} COP</strong>
                        </div>
                    </div>
                </div>

                <div class="ad-footer">
                    <button class="btn btn-whatsapp" onclick="contactWhatsApp('${userWhatsapp}', '${escapeHtml(ad.type)}', ${ad.amount}, ${priceWithMargin.toFixed(0)})">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" fill="currentColor"/>
                        </svg>
                        Contactar
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ==================== WhatsApp Contact ====================
function contactWhatsApp(phone, adType, amount, pricePerUSDT) {
    const action = adType === 'sell' ? 'comprar' : 'vender';
    const message = `Hola! Estoy interesado en ${action} ${amount} USDT a $${formatNumber(pricePerUSDT)} COP por unidad.`;
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = String(phone || '').replace(/\D/g, '');

    if (!cleanPhone) {
        showNotification('No hay número de WhatsApp disponible', true);
        return;
    }

    window.open(`https://wa.me/${cleanPhone}?text=${encodedMessage}`, '_blank');
}

// ==================== Filter Tabs ====================
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderAds();
    });
});

// ==================== Modal Management ====================
const modal = document.getElementById('createAdModal');
const createAdBtn = document.getElementById('createAdBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelAdBtn = document.getElementById('cancelAdBtn');

if (createAdBtn && modal) {
    createAdBtn.addEventListener('click', () => {
        modal.classList.add('active');
        updatePricePreview();
    });
}

if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
}

if (cancelAdBtn && modal) {
    cancelAdBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
}

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

// ==================== Ad Type Change ====================
document.querySelectorAll('input[name="ad-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const type = e.target.value;
        const paymentMethodGroup = document.getElementById('paymentMethodGroup');
        const accountNumberGroup = document.getElementById('accountNumberGroup');
        const walletGroup = document.getElementById('walletGroup');

        if (!paymentMethodGroup || !accountNumberGroup || !walletGroup) return;

        if (type === 'sell') {
            paymentMethodGroup.style.display = 'block';
            accountNumberGroup.style.display = 'block';
            walletGroup.style.display = 'none';
            const walletInput = document.getElementById('ad-wallet');
            if (walletInput) walletInput.required = false;
        } else {
            paymentMethodGroup.style.display = 'block';
            accountNumberGroup.style.display = 'block';
            walletGroup.style.display = 'block';
            const walletInput = document.getElementById('ad-wallet');
            if (walletInput) walletInput.required = true;
        }

        const paymentInput = document.getElementById('ad-payment');
        const accountInput = document.getElementById('ad-account');
        if (paymentInput) paymentInput.required = true;
        if (accountInput) accountInput.required = true;

        updatePricePreview();
    });
});

// ==================== Price Preview ====================
function updatePricePreview() {
    const amountInput = document.getElementById('ad-amount');
    const marginInput = document.getElementById('ad-margin');

    const amount = parseFloat(amountInput?.value) || 0;
    const margin = parseFloat(marginInput?.value) || 0;

    const finalPrice = currentPrice * (1 + margin / 100);
    const total = amount * finalPrice;

    const basePriceEl = document.getElementById('basePrice');
    const finalPriceEl = document.getElementById('finalPrice');
    const totalAmountEl = document.getElementById('totalAmount');

    if (basePriceEl) basePriceEl.textContent = `$${formatNumber(currentPrice.toFixed(0))} COP`;
    if (finalPriceEl) finalPriceEl.textContent = `$${formatNumber(finalPrice.toFixed(0))} COP`;
    if (totalAmountEl) totalAmountEl.textContent = `$${formatNumber(total.toFixed(0))} COP`;
}

document.getElementById('ad-amount')?.addEventListener('input', updatePricePreview);
document.getElementById('ad-margin')?.addEventListener('input', updatePricePreview);

// ==================== Create Ad ====================
document.getElementById('createAdForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const type = document.querySelector('input[name="ad-type"]:checked')?.value;
    const amount = parseFloat(document.getElementById('ad-amount')?.value || '0');
    const margin = parseFloat(document.getElementById('ad-margin')?.value || '0');
    const paymentMethod = document.getElementById('ad-payment')?.value?.trim() || '';
    const accountNumber = document.getElementById('ad-account')?.value?.trim() || '';
    const binanceWallet = document.getElementById('ad-wallet')?.value?.trim() || '';

    if (margin < -5 || margin > 5) {
        showNotification('El margen debe estar entre -5% y +5%', true);
        return;
    }

    if (!type || !amount || !paymentMethod) {
        showNotification('Debes completar los campos obligatorios', true);
        return;
    }

    if (type === 'sell' && !accountNumber) {
        showNotification('Debes especificar tu número de cuenta', true);
        return;
    }

    try {
        const response = await fetch(`${API_URL}/ads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                type,
                amount,
                margin,
                paymentMethod,
                accountNumber,
                binanceWallet: type === 'buy' ? binanceWallet : user.binanceWallet
            })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('¡Anuncio creado exitosamente!');
            modal?.classList.remove('active');
            document.getElementById('createAdForm')?.reset();
            await loadAds();
            if (document.getElementById('viewMyAds')?.style.display === 'block') {
                await loadMyAds();
            }
        } else {
            showNotification(data.error || 'Error al crear el anuncio', true);
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Error de conexión', true);
    }
});

// ==================== Logout ====================
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
});

// ==================== View Tabs (Mercado / Mis Anuncios) ====================
const tabMarket = document.getElementById('tabMarket');
const tabMyAds = document.getElementById('tabMyAds');
const viewMarket = document.getElementById('viewMarket');
const viewMyAds = document.getElementById('viewMyAds');

if (tabMarket && tabMyAds && viewMarket && viewMyAds) {
    tabMarket.addEventListener('click', () => {
        tabMarket.classList.add('active');
        tabMyAds.classList.remove('active');
        viewMarket.style.display = 'block';
        viewMyAds.style.display = 'none';
    });

    tabMyAds.addEventListener('click', () => {
        tabMyAds.classList.add('active');
        tabMarket.classList.remove('active');
        viewMyAds.style.display = 'block';
        viewMarket.style.display = 'none';
        loadMyAds();
    });
}

// ==================== Load My Ads ====================
async function loadMyAds() {
    const container = document.getElementById('myAdsContainer');
    const emptyState = document.getElementById('myAdsEmpty');

    if (!container || !emptyState) return;

    container.innerHTML = '<p style="color:var(--text-secondary,#aaa);padding:16px">Cargando...</p>';
    emptyState.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/ads/my`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'index.html';
            return;
        }

        const data = await response.json();
        const myAds = (data.ads || []).map(normalizeAd);

        if (myAds.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        container.innerHTML = myAds.map(ad => {
            const priceWithMargin = currentPrice * (1 + ad.margin / 100);
            const typeLabel = ad.type === 'sell' ? '↓ Vender USDT' : '↑ Comprar USDT';

            return `
                <div class="my-ad-card">
                    <div class="my-ad-card-header">
                        <div class="ad-type-badge ${escapeHtml(ad.type)}">${typeLabel}</div>
                    </div>
                    <div class="my-ad-card-body">
                        <div>Cantidad: <strong>${formatNumber(ad.amount)} USDT</strong></div>
                        <div>Margen: <strong>${ad.margin > 0 ? '+' : ''}${ad.margin}%</strong></div>
                        <div>Precio actual: <strong>$${formatNumber(priceWithMargin.toFixed(0))} COP</strong></div>
                        <div>Método de pago: <strong>${safeUpper(ad.paymentMethod) || 'NO ESPECIFICADO'}</strong></div>
                        <div>Cuenta: <strong>${escapeHtml(ad.accountNumber || 'No especificada')}</strong></div>
                        ${ad.binanceWallet ? `<div>Wallet: <strong>${escapeHtml(ad.binanceWallet)}</strong></div>` : ''}
                    </div>
                    <div class="my-ad-card-footer">
                        <button class="btn-delete" onclick="deleteAd('${ad.id}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M3 6H21M8 6V4H16V6M19 6L18 20H6L5 6" stroke="currentColor" stroke-width="2"/>
                            </svg>
                            Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading my ads:', error);
        container.innerHTML = '<p style="color:#ef4444;padding:16px">Error al cargar tus anuncios</p>';
    }
}

// ==================== Delete Ad ====================
async function deleteAd(adId) {
    if (!confirm('¿Seguro que quieres eliminar este anuncio?')) return;

    try {
        const response = await fetch(`${API_URL}/ads/${adId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('Anuncio eliminado');
            loadAds();
            loadMyAds();
        } else {
            showNotification(data.error || 'Error al eliminar', true);
        }
    } catch (error) {
        console.error('Error deleting ad:', error);
        showNotification('Error de conexión', true);
    }
}

// ==================== Initialize ====================
loadAds();