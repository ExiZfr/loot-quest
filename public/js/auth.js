/**
 * LootQuest - Frontend Authentication Module (v2.0)
 * 
 * Complete authentication system with 3 flows:
 * 1. Email/Password with strict email verification gate
 * 2. Google OAuth via Firebase popup
 * 3. Discord OAuth (server-side redirect)
 * 
 * @requires Firebase SDK loaded before this script
 * 
 * Usage:
 *   LootAuth.registerWithEmail(email, password, displayName)
 *   LootAuth.loginWithEmail(email, password)
 *   LootAuth.loginWithGoogle()
 *   LootAuth.loginWithDiscord()
 */

const LootAuth = {

    // ═══════════════════════════════════════════════════════════════════════════
    // CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════

    config: {
        CHECK_EMAIL_URL: '/check-email.html',
        DASHBOARD_URL: '/dashboard.html',
        LOGIN_URL: '/',
        API_LOGIN: '/api/auth/login',
        API_LOGOUT: '/api/auth/logout',
        API_USER_ME: '/api/user/me',
        API_DISCORD: '/api/auth/discord'
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EMAIL/PASSWORD REGISTRATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Register a new user with Email/Password
     * 
     * FLOW:
     * 1. Create Firebase account
     * 2. Send verification email
     * 3. Sign out immediately (EMAIL VERIFICATION GATE)
     * 4. Redirect to check-email.html
     * 
     * @param {string} email - User's email address
     * @param {string} password - Password (min 6 chars)
     * @param {string} displayName - User's chosen display name/pseudo
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async registerWithEmail(email, password, displayName) {
        console.log('🔵 [LootAuth] Registration attempt for:', email);

        try {
            // Validation
            if (!email || !password) {
                throw new Error('Email et mot de passe requis');
            }

            if (password.length < 6) {
                throw new Error('Le mot de passe doit contenir au moins 6 caractères');
            }

            if (!displayName || displayName.length < 3) {
                throw new Error('Le pseudo doit contenir au moins 3 caractères');
            }

            // 1. Create Firebase account
            const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = result.user;

            console.log('✅ [LootAuth] Account created:', user.uid);

            // 2. Update profile with display name
            await user.updateProfile({
                displayName: displayName
            });

            console.log('✅ [LootAuth] Profile updated with displayName:', displayName);

            // 3. Send verification email
            await user.sendEmailVerification();

            console.log('📧 [LootAuth] Verification email sent to:', email);

            // 4. Sign out immediately - EMAIL VERIFICATION GATE
            await firebase.auth().signOut();

            console.log('🔒 [LootAuth] User signed out - must verify email before login');

            // 5. Redirect to check-email page
            const redirectUrl = `${this.config.CHECK_EMAIL_URL}?email=${encodeURIComponent(email)}`;
            window.location.href = redirectUrl;

            return { success: true };

        } catch (error) {
            console.error('❌ [LootAuth] Registration error:', error);

            // Translate Firebase error codes
            const errorMessage = this._translateFirebaseError(error);

            return { success: false, error: errorMessage };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EMAIL/PASSWORD LOGIN
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Login with Email/Password
     * 
     * FLOW:
     * 1. Sign in with Firebase
     * 2. Check emailVerified STRICTLY
     * 3. If NOT verified: sign out + return error
     * 4. If verified: get idToken + create backend session + redirect
     * 
     * @param {string} email - User's email
     * @param {string} password - User's password
     * @returns {Promise<{success: boolean, error?: string, errorCode?: string}>}
     */
    async loginWithEmail(email, password) {
        console.log('🔵 [LootAuth] Email login attempt for:', email);

        try {
            // Validation
            if (!email || !password) {
                throw new Error('Email et mot de passe requis');
            }

            // 1. Sign in with Firebase
            const result = await firebase.auth().signInWithEmailAndPassword(email, password);
            const user = result.user;

            console.log('✅ [LootAuth] Firebase sign-in successful');
            console.log('📧 [LootAuth] Email verified:', user.emailVerified);

            // 2. STRICT EMAIL VERIFICATION CHECK
            if (!user.emailVerified) {
                console.log('⚠️ [LootAuth] Email NOT verified - blocking access');

                // Sign out immediately
                await firebase.auth().signOut();

                return {
                    success: false,
                    error: 'Veuillez vérifier votre email avant de vous connecter',
                    errorCode: 'EMAIL_NOT_VERIFIED'
                };
            }

            // 3. Email verified - proceed with backend session
            console.log('✅ [LootAuth] Email verified - creating backend session');

            return await this._createBackendSession(user);

        } catch (error) {
            console.error('❌ [LootAuth] Login error:', error);

            const errorMessage = this._translateFirebaseError(error);

            return { success: false, error: errorMessage };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // GOOGLE OAuth (Firebase Popup)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Login with Google OAuth
     * 
     * FLOW:
     * 1. Open Google popup via Firebase
     * 2. Google accounts are auto-verified
     * 3. Get idToken + create backend session + redirect
     * 
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async loginWithGoogle() {
        console.log('🔵 [LootAuth] Google OAuth initiated');

        try {
            const provider = new firebase.auth.GoogleAuthProvider();

            // Request email scope
            provider.addScope('email');
            provider.addScope('profile');

            const result = await firebase.auth().signInWithPopup(provider);
            const user = result.user;

            console.log('✅ [LootAuth] Google sign-in successful:', user.email);

            // Google accounts are always verified - proceed directly
            return await this._createBackendSession(user);

        } catch (error) {
            console.error('❌ [LootAuth] Google login error:', error);

            // Handle popup closed by user
            if (error.code === 'auth/popup-closed-by-user') {
                return { success: false, error: 'Connexion annulée' };
            }

            if (error.code === 'auth/cancelled-popup-request') {
                return { success: false, error: 'Connexion annulée' };
            }

            const errorMessage = this._translateFirebaseError(error);

            return { success: false, error: errorMessage };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // DISCORD OAuth (Server-Side)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Login with Discord OAuth
     * 
     * Redirects to backend which handles the OAuth flow server-side
     * The backend will redirect back to dashboard on success
     */
    loginWithDiscord() {
        console.log('🔵 [LootAuth] Discord OAuth - redirecting to server');
        window.location.href = this.config.API_DISCORD;
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // LOGOUT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Logout - Destroy both Firebase and backend sessions
     * 
     * @returns {Promise<void>}
     */
    async logout() {
        console.log('🔵 [LootAuth] Logout initiated');

        try {
            // 1. Sign out from Firebase
            await firebase.auth().signOut();
            console.log('✅ [LootAuth] Firebase sign-out complete');

            // 2. Destroy backend session
            await fetch(this.config.API_LOGOUT, {
                method: 'POST',
                credentials: 'include'
            });
            console.log('✅ [LootAuth] Backend session destroyed');

            // 3. Redirect to home
            window.location.href = this.config.LOGIN_URL;

        } catch (error) {
            console.error('❌ [LootAuth] Logout error:', error);
            // Redirect anyway
            window.location.href = this.config.LOGIN_URL;
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Check if user has an active backend session
     * 
     * @returns {Promise<{authenticated: boolean, user?: Object}>}
     */
    async checkSession() {
        try {
            const response = await fetch(this.config.API_USER_ME, {
                credentials: 'include'
            });

            if (response.status === 401) {
                return { authenticated: false };
            }

            const data = await response.json();

            if (data.success && data.user) {
                return { authenticated: true, user: data.user };
            }

            return { authenticated: false };

        } catch (error) {
            console.error('[LootAuth] Session check failed:', error);
            return { authenticated: false };
        }
    },

    /**
     * Get current user from backend session
     * 
     * @returns {Promise<Object|null>}
     */
    async getCurrentUser() {
        const session = await this.checkSession();
        return session.authenticated ? session.user : null;
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // EMAIL VERIFICATION HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Resend verification email
     * Requires user to provide password for security
     * 
     * @param {string} email - User's email
     * @param {string} password - User's password
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async resendVerificationEmail(email, password) {
        console.log('🔵 [LootAuth] Resending verification email to:', email);

        try {
            // Sign in temporarily
            const result = await firebase.auth().signInWithEmailAndPassword(email, password);
            const user = result.user;

            // Check if already verified
            if (user.emailVerified) {
                await firebase.auth().signOut();
                return {
                    success: true,
                    alreadyVerified: true,
                    message: 'Votre email est déjà vérifié !'
                };
            }

            // Send verification email
            await user.sendEmailVerification();

            // Sign out
            await firebase.auth().signOut();

            console.log('✅ [LootAuth] Verification email resent');

            return { success: true };

        } catch (error) {
            console.error('❌ [LootAuth] Resend error:', error);

            const errorMessage = this._translateFirebaseError(error);

            return { success: false, error: errorMessage };
        }
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Create backend session from authenticated Firebase user
     * 
     * @private
     * @param {firebase.User} user - Authenticated Firebase user
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async _createBackendSession(user) {
        try {
            // Get Firebase ID token
            const idToken = await user.getIdToken();

            console.log('🔐 [LootAuth] Sending token to backend...');

            // Send to backend for session creation
            const response = await fetch(this.config.API_LOGIN, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Important for session cookies
                body: JSON.stringify({
                    idToken,
                    displayName: user.displayName
                })
            });

            const data = await response.json();

            if (data.success) {
                console.log('✅ [LootAuth] Backend session created');
                console.log('🚀 [LootAuth] Redirecting to:', data.redirectUrl);

                // Redirect to dashboard
                window.location.href = data.redirectUrl || this.config.DASHBOARD_URL;

                return { success: true, user: data.user };

            } else {
                // Handle specific backend errors
                if (data.error === 'EMAIL_NOT_VERIFIED') {
                    // Sign out and return verification error
                    await firebase.auth().signOut();
                    return {
                        success: false,
                        error: data.message || 'Veuillez vérifier votre email',
                        errorCode: 'EMAIL_NOT_VERIFIED'
                    };
                }

                return { success: false, error: data.error || 'Échec de la connexion' };
            }

        } catch (error) {
            console.error('❌ [LootAuth] Backend session error:', error);
            return { success: false, error: 'Erreur de connexion au serveur' };
        }
    },

    /**
     * Translate Firebase error codes to user-friendly French messages
     * 
     * @private
     * @param {Error} error - Firebase error object
     * @returns {string} User-friendly error message
     */
    _translateFirebaseError(error) {
        const errorMap = {
            'auth/email-already-in-use': 'Cet email est déjà utilisé',
            'auth/invalid-email': 'Email invalide',
            'auth/weak-password': 'Mot de passe trop faible (min. 6 caractères)',
            'auth/user-not-found': 'Aucun compte trouvé avec cet email',
            'auth/wrong-password': 'Mot de passe incorrect',
            'auth/user-disabled': 'Ce compte a été désactivé',
            'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
            'auth/network-request-failed': 'Erreur réseau. Vérifiez votre connexion.',
            'auth/popup-closed-by-user': 'Connexion annulée',
            'auth/cancelled-popup-request': 'Connexion annulée',
            'auth/operation-not-allowed': 'Cette méthode de connexion n\'est pas activée',
            'auth/invalid-credential': 'Identifiants invalides'
        };

        return errorMap[error.code] || error.message || 'Une erreur est survenue';
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INIT: Auth State Listener
// ═══════════════════════════════════════════════════════════════════════════

// Listen for Firebase auth state changes
if (typeof firebase !== 'undefined') {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log('🔥 [Firebase] Auth state: Signed in as', user.email);
        } else {
            console.log('🔥 [Firebase] Auth state: Signed out');
        }

        // Dispatch custom event for other scripts
        window.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: { user }
        }));
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Only run protection on dashboard page
    if (window.location.pathname.includes('dashboard')) {
        console.log('🔒 [LootAuth] Dashboard protection check...');

        const session = await LootAuth.checkSession();

        if (!session.authenticated) {
            console.log('⚠️ [LootAuth] Not authenticated - redirecting to login');
            window.location.href = '/?login=required';
            return;
        }

        console.log('✅ [LootAuth] Authenticated as:', session.user.displayName);

        // Dispatch event for dashboard UI to use
        window.dispatchEvent(new CustomEvent('userLoaded', {
            detail: session.user
        }));
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// For module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LootAuth;
}

// Make globally available
window.LootAuth = LootAuth;
