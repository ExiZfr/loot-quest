/**
 * LootQuest - Frontend Authentication Module (v3.0)
 * 
 * OAuth-only authentication:
 * 1. Google OAuth via Firebase popup
 * 2. Discord OAuth (server-side redirect)
 * 
 * @requires Firebase SDK loaded before this script
 */

const LootAuth = {

    config: {
        DASHBOARD_URL: '/dashboard.html',
        LOGIN_URL: '/',
        API_LOGIN: '/api/auth/login',
        API_LOGOUT: '/api/auth/logout',
        API_USER_ME: '/api/user/me',
        API_DISCORD: '/api/auth/discord'
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // GOOGLE OAuth (Firebase Popup)
    // ═══════════════════════════════════════════════════════════════════════════

    async loginWithGoogle() {
        console.log('🔵 [LootAuth] Google OAuth initiated');

        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.addScope('email');
            provider.addScope('profile');

            const result = await firebase.auth().signInWithPopup(provider);
            const user = result.user;

            console.log('✅ [LootAuth] Google sign-in successful:', user.email);
            return await this._createBackendSession(user);

        } catch (error) {
            console.error('❌ [LootAuth] Google login error:', error);

            if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                return { success: false, error: 'Connexion annulée' };
            }

            return { success: false, error: this._translateFirebaseError(error) };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // DISCORD OAuth (Server-Side)
    // ═══════════════════════════════════════════════════════════════════════════

    loginWithDiscord() {
        console.log('🔵 [LootAuth] Discord OAuth - redirecting to server');
        window.location.href = this.config.API_DISCORD;
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // LOGOUT
    // ═══════════════════════════════════════════════════════════════════════════

    async logout() {
        console.log('🔵 [LootAuth] Logout initiated');

        try {
            await firebase.auth().signOut();
            await fetch(this.config.API_LOGOUT, { method: 'POST', credentials: 'include' });
            window.location.href = this.config.LOGIN_URL;
        } catch (error) {
            console.error('❌ [LootAuth] Logout error:', error);
            window.location.href = this.config.LOGIN_URL;
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    async checkSession() {
        try {
            const response = await fetch(this.config.API_USER_ME, { credentials: 'include' });
            if (response.status === 401) return { authenticated: false };

            const data = await response.json();
            return (data.success && data.user) ? { authenticated: true, user: data.user } : { authenticated: false };
        } catch (error) {
            console.error('[LootAuth] Session check failed:', error);
            return { authenticated: false };
        }
    },

    async getCurrentUser() {
        const session = await this.checkSession();
        return session.authenticated ? session.user : null;
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    async _createBackendSession(user) {
        try {
            const idToken = await user.getIdToken();

            const response = await fetch(this.config.API_LOGIN, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ idToken, displayName: user.displayName })
            });

            const data = await response.json();

            if (data.success) {
                console.log('✅ [LootAuth] Backend session created');
                window.location.href = data.redirectUrl || this.config.DASHBOARD_URL;
                return { success: true, user: data.user };
            }

            return { success: false, error: data.error || 'Échec de la connexion' };

        } catch (error) {
            console.error('❌ [LootAuth] Backend session error:', error);
            return { success: false, error: 'Erreur de connexion au serveur' };
        }
    },

    _translateFirebaseError(error) {
        const errorMap = {
            'auth/popup-closed-by-user': 'Connexion annulée',
            'auth/cancelled-popup-request': 'Connexion annulée',
            'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
            'auth/operation-not-allowed': 'Cette méthode de connexion n\'est pas activée'
        };
        return errorMap[error.code] || error.message || 'Une erreur est survenue';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INIT: Auth State Listener
// ═══════════════════════════════════════════════════════════════════════════

function initAuthListener() {
    if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
        setTimeout(initAuthListener, 50);
        return;
    }

    firebase.auth().onAuthStateChanged((user) => {
        console.log(user ? `🔥 [Firebase] Signed in as ${user.email}` : '🔥 [Firebase] Signed out');
        window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initAuthListener, 100));
} else {
    setTimeout(initAuthListener, 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    if (window.location.pathname.includes('dashboard')) {
        const session = await LootAuth.checkSession();
        if (!session.authenticated) {
            window.location.href = '/?login=required';
            return;
        }
        window.dispatchEvent(new CustomEvent('userLoaded', { detail: session.user }));
    }
});

// Make globally available
window.LootAuth = LootAuth;
