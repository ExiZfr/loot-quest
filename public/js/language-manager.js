/**
 * LootQuest Language Manager
 * Handles i18n translation switching without page reload
 */
(function () {
    'use strict';

    // ══════════════════════ CONFIG ══════════════════════
    const SUPPORTED_LANGS = ['en', 'fr'];
    const DEFAULT_LANG = 'en';
    const COOKIE_NAME = 'lang';
    const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

    // ══════════════════════ HELPERS ══════════════════════

    /**
     * Get cookie value by name
     */
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    }

    /**
     * Set cookie with value
     */
    function setCookie(name, value, maxAge = COOKIE_MAX_AGE) {
        document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
    }

    /**
     * Get initial language from cookie, localStorage, or browser
     */
    function getInitialLang() {
        // Priority: Cookie > localStorage > Browser > Default
        const cookie = getCookie(COOKIE_NAME);
        if (cookie && SUPPORTED_LANGS.includes(cookie)) return cookie;

        const stored = localStorage.getItem(COOKIE_NAME);
        if (stored && SUPPORTED_LANGS.includes(stored)) return stored;

        // Check browser language
        const browserLang = navigator.language?.substring(0, 2);
        if (browserLang && SUPPORTED_LANGS.includes(browserLang)) return browserLang;

        return DEFAULT_LANG;
    }

    /**
     * Get current language
     */
    function getCurrentLang() {
        return localStorage.getItem(COOKIE_NAME) || getInitialLang();
    }

    // ══════════════════════ TRANSLATION ENGINE ══════════════════════

    /**
     * Update all elements with data-i18n attribute
     * @param {string} lang - Language code ('en' or 'fr')
     */
    function updateLanguage(lang) {
        // Validate language
        if (!SUPPORTED_LANGS.includes(lang)) {
            console.warn(`Language '${lang}' not supported. Using '${DEFAULT_LANG}'.`);
            lang = DEFAULT_LANG;
        }

        // Check if translations object exists
        if (typeof translations === 'undefined') {
            console.error('Translations not loaded. Make sure translations.js is included before language-manager.js');
            return;
        }

        const dict = translations[lang];
        if (!dict) {
            console.error(`No translations found for language '${lang}'`);
            return;
        }

        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            const translation = dict[key];

            if (translation) {
                // Handle different element types
                const tagName = el.tagName.toUpperCase();

                if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
                    // For inputs, update placeholder
                    if (el.placeholder) {
                        el.placeholder = translation;
                    }
                } else if (tagName === 'IMG') {
                    // For images, update alt text
                    el.alt = translation;
                } else if (tagName === 'META') {
                    // For meta tags, update content
                    el.content = translation;
                } else {
                    // For all other elements, update text content
                    // Preserve child elements if any by only updating text nodes
                    if (el.childElementCount === 0) {
                        el.textContent = translation;
                    } else {
                        // Has children, try to update first text node only
                        const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
                        if (textNode) {
                            textNode.textContent = translation;
                        }
                    }
                }
            }
        });

        // Update language switcher button
        updateLangSwitcherUI(lang);

        // Update HTML lang attribute for accessibility
        document.documentElement.lang = lang;

        // Save preference
        localStorage.setItem(COOKIE_NAME, lang);
        setCookie(COOKIE_NAME, lang);

        // Dispatch event for other scripts that might need to know
        window.dispatchEvent(new CustomEvent('languageChange', { detail: { lang } }));

        console.log(`🌍 Language changed to: ${lang.toUpperCase()}`);
    }

    /**
     * Toggle between available languages
     */
    function toggleLanguage() {
        const current = getCurrentLang();
        const newLang = current === 'en' ? 'fr' : 'en';
        updateLanguage(newLang);
    }

    /**
     * Update the language switcher button UI
     */
    function updateLangSwitcherUI(lang) {
        const switcher = document.getElementById('lang-switcher');
        if (!switcher) return;

        const flags = {
            'en': '🇺🇸',
            'fr': '🇫🇷'
        };

        // Update flag emoji
        const flagSpan = switcher.querySelector('.lang-flag') || switcher;
        flagSpan.textContent = flags[lang] || flags.en;

        // Update title/tooltip
        switcher.title = lang === 'en' ? 'Switch to French' : 'Passer en Anglais';
    }

    // ══════════════════════ INITIALIZATION ══════════════════════

    /**
     * Initialize language system
     */
    function init() {
        const lang = getInitialLang();

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateLanguage(lang);
            });
        } else {
            // DOM already loaded, apply immediately
            updateLanguage(lang);
        }
    }

    // ══════════════════════ EXPOSE GLOBAL API ══════════════════════

    window.LootQuestI18n = {
        updateLanguage,
        toggleLanguage,
        getCurrentLang,
        getSupportedLangs: () => SUPPORTED_LANGS
    };

    // Legacy support - expose functions directly on window
    window.updateLanguage = updateLanguage;
    window.toggleLanguage = toggleLanguage;

    // Auto-initialize
    init();

})();
