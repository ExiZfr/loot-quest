/**
 * Migration Script v4: Add integrated auth modal to blogs
 * Updates existing blogs with auth modal (Google + Discord buttons)
 * 
 * Run: node migrate-blogs-v4.js
 */

const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'public', 'blog');

// Auth modal HTML (template for FR and EN)
const getAuthModal = (lang) => `
    <!-- Auth Modal -->
    <div id="auth-modal" class="fixed inset-0 z-50 hidden">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="closeAuthModal()"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6">
            <div class="bg-[#151A23] border border-white/10 rounded-2xl p-8 relative">
                <button onclick="closeAuthModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl">&times;</button>
                <h2 class="text-2xl font-bold text-white text-center mb-2">${lang === 'fr' ? 'Connexion' : 'Log In'}</h2>
                <p class="text-gray-400 text-center mb-6">${lang === 'fr' ? 'Connectez-vous pour commencer à gagner' : 'Sign in to start earning'}</p>
                
                <div class="space-y-4">
                    <a href="/?auth=google" class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl transition-all hover:scale-[1.02] no-underline">
                        <svg class="w-6 h-6" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>${lang === 'fr' ? 'Continuer avec Google' : 'Continue with Google'}</span>
                    </a>
                    
                    <a href="/api/auth/discord" class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all hover:scale-[1.02] no-underline">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                        </svg>
                        <span>${lang === 'fr' ? 'Continuer avec Discord' : 'Continue with Discord'}</span>
                    </a>
                </div>
                
                <p class="text-center text-xs text-gray-500 mt-6">
                    ${lang === 'fr' ? 'En vous connectant, vous acceptez nos' : 'By logging in, you agree to our'} 
                    <a href="/terms" class="text-indigo-400 hover:underline">${lang === 'fr' ? 'Conditions' : 'Terms'}</a>
                </p>
            </div>
        </div>
    </div>`;

// New script with modal functions
const newScript = `
    <script>
        function openAuthModal() {
            document.getElementById('auth-modal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        
        function closeAuthModal() {
            document.getElementById('auth-modal').classList.add('hidden');
            document.body.style.overflow = '';
        }
        
        async function handleCTA(event) {
            event.preventDefault();
            try {
                const res = await fetch('/api/user/me', { credentials: 'include' });
                if (res.ok) {
                    window.location.href = '/dashboard.html';
                } else {
                    openAuthModal();
                }
            } catch (e) {
                openAuthModal();
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[href="/dashboard.html"]').forEach(btn => {
                btn.addEventListener('click', handleCTA);
            });
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAuthModal();
        });
    </script>`;

let migratedCount = 0;
let skippedCount = 0;

const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
console.log(`\n🔄 Found ${files.length} blog files to update...\n`);

files.forEach(file => {
    const filePath = path.join(blogDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has auth modal
    if (content.includes('id="auth-modal"')) {
        console.log(`⏭️  Skipping (already has modal): ${file}`);
        skippedCount++;
        return;
    }

    // Detect language
    const lang = file.includes('-fr.html') || content.includes('lang="fr"') ? 'fr' : 'en';

    // Remove old handleCTA script if present
    content = content.replace(/<script>\s*\/\/ Check if user is logged in[\s\S]*?<\/script>/, '');
    content = content.replace(/<script>\s*async function handleCTA[\s\S]*?<\/script>/, '');

    // Add auth modal before </body>
    const authModalHtml = getAuthModal(lang);
    content = content.replace('</body>', authModalHtml + '\n' + newScript + '\n</body>');

    fs.writeFileSync(filePath, content);
    console.log(`✅ Added auth modal: ${file}`);
    migratedCount++;
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Migration Complete!`);
console.log(`   ✅ Updated: ${migratedCount} files`);
console.log(`   ⏭️  Skipped: ${skippedCount} files`);
console.log(`${'═'.repeat(50)}\n`);
