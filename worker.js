// ==================== Cloudflare Worker + D1 ====================
// Backend/API para la plataforma P2P usando Cloudflare D1 (SQLite)

// ==================== CORS Headers ====================
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ==================== Helpers ====================
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function createJWT(payload, secret) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    const signature = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${header}.${body}.${secret}`)
    );
    const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));
    return `${header}.${body}.${encodedSig}`;
}

async function verifyJWT(token) {
    try {
        const [, encodedPayload] = token.split('.');
        return JSON.parse(atob(encodedPayload));
    } catch {
        return null;
    }
}

// Convierte un ad de snake_case (D1) a camelCase (frontend)
function formatAd(ad) {
    return {
        id: ad.id,
        userId: ad.user_id,
        userName: ad.user_name,
        userWhatsapp: ad.user_whatsapp,
        type: ad.type,
        amount: ad.amount,
        margin: ad.margin,
        paymentMethod: ad.payment_method,
        accountNumber: ad.account_number,
        binanceWallet: ad.binance_wallet,
        createdAt: ad.created_at,
        active: ad.active
    };
}

// ==================== Main Handler ====================
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        if (method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // ==================== Auth Routes ====================

        // POST /auth/register
        if (path === '/auth/register' && method === 'POST') {
            try {
                const { username, name, whatsapp, password, binanceWallet } = await request.json();

                if (!username || !name || !whatsapp || !password) {
                    return jsonResponse({ error: 'Campos requeridos faltantes' }, 400);
                }

                const existing = await env.DB.prepare(
                    'SELECT id FROM users WHERE username = ?'
                ).bind(username).first();

                if (existing) {
                    return jsonResponse({ error: 'El usuario ya existe' }, 409);
                }

                const hashedPassword = await hashPassword(password);
                const id = crypto.randomUUID();

                await env.DB.prepare(
                    `INSERT INTO users (id, username, name, whatsapp, password, binance_wallet, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).bind(id, username, name, whatsapp, hashedPassword, binanceWallet || '', new Date().toISOString()).run();

                return jsonResponse({ success: true, userId: id }, 201);

            } catch (error) {
                return jsonResponse({ error: 'Error al crear usuario: ' + error.message }, 500);
            }
        }

        // POST /auth/login
        if (path === '/auth/login' && method === 'POST') {
            try {
                const { username, password } = await request.json();

                if (!username || !password) {
                    return jsonResponse({ error: 'Credenciales requeridas' }, 400);
                }

                const hashedPassword = await hashPassword(password);
                const user = await env.DB.prepare(
                    'SELECT * FROM users WHERE username = ? AND password = ?'
                ).bind(username, hashedPassword).first();

                if (!user) {
                    return jsonResponse({ error: 'Credenciales incorrectas' }, 401);
                }

                const token = await createJWT({
                    id: user.id,
                    username: user.username,
                    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
                }, env.JWT_SECRET);

                return jsonResponse({
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        whatsapp: user.whatsapp,
                        binanceWallet: user.binance_wallet
                    }
                });

            } catch (error) {
                return jsonResponse({ error: 'Error al iniciar sesion: ' + error.message }, 500);
            }
        }

        // ==================== Auth Middleware ====================
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return jsonResponse({ error: 'No autorizado' }, 401);
        }

        const token = authHeader.replace('Bearer ', '');
        const payload = await verifyJWT(token);

        if (!payload || payload.exp < Date.now()) {
            return jsonResponse({ error: 'Token invalido o expirado' }, 401);
        }

        const currentUser = await env.DB.prepare(
            'SELECT * FROM users WHERE id = ?'
        ).bind(payload.id).first();

        if (!currentUser) {
            return jsonResponse({ error: 'Usuario no encontrado' }, 404);
        }

        // ==================== Ads Routes ====================

        // GET /ads/my - anuncios del usuario actual
        if (path === '/ads/my' && method === 'GET') {
            try {
                const { results } = await env.DB.prepare(
                    'SELECT * FROM ads WHERE user_id = ? ORDER BY created_at DESC'
                ).bind(currentUser.id).all();

                return jsonResponse({ ads: (results || []).map(formatAd) });

            } catch (error) {
                return jsonResponse({ error: 'Error al obtener tus anuncios: ' + error.message }, 500);
            }
        }

        // GET /ads
        if (path === '/ads' && method === 'GET') {
            try {
                const { results } = await env.DB.prepare(
                    'SELECT * FROM ads ORDER BY created_at DESC'
                ).all();

                return jsonResponse({ ads: (results || []).map(formatAd) });

            } catch (error) {
                return jsonResponse({ error: 'Error al obtener anuncios: ' + error.message }, 500);
            }
        }

        // POST /ads
        if (path === '/ads' && method === 'POST') {
            try {
                const { type, amount, margin, paymentMethod, accountNumber, binanceWallet } = await request.json();

                if (!type || !amount || margin === undefined || !paymentMethod) {
                    return jsonResponse({ error: 'Campos requeridos faltantes' }, 400);
                }

                if (margin < -5 || margin > 5) {
                    return jsonResponse({ error: 'El margen debe estar entre -5% y +5%' }, 400);
                }

                if (type === 'sell' && !accountNumber) {
                    return jsonResponse({ error: 'Numero de cuenta requerido para vender' }, 400);
                }

                const id = crypto.randomUUID();

                await env.DB.prepare(
                    `INSERT INTO ads (id, user_id, user_name, user_whatsapp, type, amount, margin, payment_method, account_number, binance_wallet, created_at, active)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    id,
                    currentUser.id,
                    currentUser.name,
                    currentUser.whatsapp,
                    type,
                    parseFloat(amount),
                    parseFloat(margin),
                    paymentMethod,
                    accountNumber || '',
                    binanceWallet || currentUser.binance_wallet || '',
                    new Date().toISOString(),
                    1
                ).run();

                return jsonResponse({ success: true, adId: id }, 201);

            } catch (error) {
                return jsonResponse({ error: 'Error al crear anuncio: ' + error.message }, 500);
            }
        }

        // DELETE /ads/:id
        if (path.startsWith('/ads/') && method === 'DELETE') {
            try {
                const adId = path.split('/')[2];

                const ad = await env.DB.prepare(
                    'SELECT * FROM ads WHERE id = ?'
                ).bind(adId).first();

                if (!ad) {
                    return jsonResponse({ error: 'Anuncio no encontrado' }, 404);
                }

                if (ad.user_id !== currentUser.id) {
                    return jsonResponse({ error: 'No autorizado' }, 403);
                }

                await env.DB.prepare(
                    'DELETE FROM ads WHERE id = ?'
                ).bind(adId).run();

                return jsonResponse({ success: true });

            } catch (error) {
                return jsonResponse({ error: 'Error al eliminar anuncio: ' + error.message }, 500);
            }
        }

        return jsonResponse({ error: 'Ruta no encontrada' }, 404);
    }
};