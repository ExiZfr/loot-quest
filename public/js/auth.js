/**
 * PixelRewards - Frontend Authentication Module
 * 
 * Handles Firebase Auth + Backend Session synchronization.
 * Uses Firebase SDK on client, then sends idToken to backend
 * for Redis session creation.
 * 
 * Usage:
 *   1. Include Firebase SDK in your HTML
 *   2. Include this script after Firebase initialization
 *   3. Call PixelAuth.loginWithGoogle() or PixelAuth.loginWithEmail()
 */

const PixelAuth = {

    /**
     * Login with Google (Firebase Auth)
     * Opens Google popup, gets idToken, creates backend session
     */
    async loginWithGoogle() {
        try {
            // Firebase Google Auth
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await firebase.auth().signInWithPopup(provider);
            const user = result.user;

            // Get Firebase idToken
            const idToken = await user.getIdToken();

            // Send to backend for session creation
            return await this.createSession(idToken);

        } catch (error) {
            console.error('Google login failed:', error);
            throw error;
        }
    },

    /**
     * Login with Email/Password (Firebase Auth)
     * @param {string} email 
     * @param {string} password 
     */
    async loginWithEmail(email, password) {
        try {
            const result = await firebase.auth().signInWithEmailAndPassword(email, password);
            const idToken = await result.user.getIdToken();
            return await this.createSession(idToken);
        } catch (error) {
            console.error('Email login failed:', error);
            throw error;
        }
    },

    /**
     * Register with Email/Password
     * @param {string} email 
     * @param {string} password 
     */
    async registerWithEmail(email, password) {
        try {
            const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const idToken = await result.user.getIdToken();
            return await this.createSession(idToken);
        } catch (error) {
            console.error('Registration failed:', error);
            throw error;
        }
    },

    /**
     * Create backend session from Firebase idToken
     * @param {string} idToken - Firebase ID token
     * @returns {Promise<Object>} - { success, redirectUrl, user }
     */
    async createSession(idToken) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important for session cookies
            body: JSON.stringify({ idToken })
        });

        const data = await response.json();

        if (data.success) {
            console.log('✅ Session created:', data.user.email);

            // Redirect to dashboard
            if (data.redirectUrl) {
                window.location.href = data.redirectUrl;
            }
        } else {
            throw new Error(data.error || 'Session creation failed');
        }

        return data;
    },

    /**
     * Get current user from session
     * @returns {Promise<Object|null>} User data or null
     */
    async getCurrentUser() {
        try {
            const response = await fetch('/api/user/me', {
                credentials: 'include'
            });

            if (response.status === 401) {
                return null; // Not logged in
            }

            const data = await response.json();
            return data.success ? data.user : null;

        } catch (error) {
            console.error('Failed to get user:', error);
            return null;
        }
    },

    /**
     * Logout - Destroy backend session
     */
    async logout() {
        try {
            // Sign out from Firebase
            await firebase.auth().signOut();

            // Destroy backend session
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });

            // Redirect to home
            window.location.href = '/';

        } catch (error) {
            console.error('Logout failed:', error);
        }
    },

    /**
     * Check if user is authenticated (has session)
     * @returns {Promise<boolean>}
     */
    async isAuthenticated() {
        const user = await this.getCurrentUser();
        return user !== null;
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-INIT: Check auth status on page load
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
    // Only run on dashboard page
    if (window.location.pathname.includes('dashboard')) {
        const user = await PixelAuth.getCurrentUser();

        if (!user) {
            // Not authenticated, redirect to login
            console.log('🔒 Not authenticated, redirecting...');
            window.location.href = '/?login=required';
            return;
        }

        // Update UI with user data
        console.log('👤 Logged in as:', user.displayName);

        // Dispatch event for other scripts to use
        window.dispatchEvent(new CustomEvent('userLoaded', {
            detail: user
        }));
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PixelAuth;
}
