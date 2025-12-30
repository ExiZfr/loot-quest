// Shop & Rewards Logic
// Handles fetching rewards, rendering the shop grid, and processing withdrawals

let shopBrands = [];
let currentBrand = null;
let selectedDenomination = null;

// Expose functions globally for dashboard.html
window.initShop = fetchShopData;
window.filterShop = filterShop;

// Initialize Shop if DOM is already ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchShopData);
} else {
    fetchShopData();
}

/**
 * Fetch rewards data from API
 */
async function fetchShopData() {
    console.log('🛍️ Shop: Fetching data...');
    try {
        const response = await fetch('/api/rewards');
        const data = await response.json();

        console.log('🛍️ Shop: API Response', data);

        if (data.success && Array.isArray(data.brands)) {
            shopBrands = data.brands;
            console.log(`🛍️ Shop: Loaded ${shopBrands.length} brands`);
            renderShop('all'); // Default view
        } else {
            console.error('🛍️ Shop: Failed to load shop data', data);
        }
    } catch (error) {
        console.error('🛍️ Shop: Fetch error:', error);
    }
}

/**
 * Render shop grid based on category filter
 */
function renderShop(category) {
    console.log(`🛍️ Shop: Rendering category '${category}'`);
    const grid = document.getElementById('rewards-grid');
    if (!grid) {
        console.error('🛍️ Shop: Grid element #rewards-grid not found!');
        return;
    }

    // Filter brands
    const filteredBrands = category === 'all'
        ? shopBrands
        : shopBrands.filter(b => b.category === category);

    console.log(`🛍️ Shop: Displaying ${filteredBrands.length} items`);

    // Clear grid
    grid.innerHTML = '';

    // Render cards
    filteredBrands.forEach(brand => {
        const card = document.createElement('div');
        card.className = "group relative bg-loot-card rounded-[22px] p-6 hover:bg-loot-card/80 border border-white/5 hover:border-loot-neon/50 transition-all duration-300 transform hover:-translate-y-1 cursor-pointer";
        card.onclick = () => openBrandModal(brand.id);

        card.innerHTML = `
            <div class="absolute inset-0 bg-gradient-to-br from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-[22px] pointer-events-none"></div>
            
            <div class="h-32 mb-4 flex items-center justify-center p-4">
                <img src="${brand.image}" alt="${brand.name}" 
                     class="max-h-full max-w-full object-contain filter drop-shadow-lg transition-transform duration-500 group-hover:scale-110">
            </div>
            
            <div class="text-center relative z-10">
                <h3 class="font-display text-xl font-bold text-white mb-1">${brand.name}</h3>
                <p class="text-xs text-gray-400 font-mono mb-4">${brand.denominations.length} options</p>
                <div class="px-4 py-2 bg-loot-dark/50 rounded-lg text-loot-neon font-bold text-sm border border-loot-neon/20 group-hover:bg-loot-neon group-hover:text-loot-black transition-colors">
                    ${getMinPrice(brand)} PTS+
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * Get minimum price for a brand display
 */
function getMinPrice(brand) {
    if (!brand.denominations || brand.denominations.length === 0) return 0;
    return Math.min(...brand.denominations.map(d => d.price));
}

/**
 * Filter shop by category (called by UI buttons)
 */
function filterShop(category) {
    console.log(`🛍️ Shop: Filter clicked '${category}'`);

    // Update active button state
    document.querySelectorAll('.shop-tab').forEach(btn => {
        // Simple check if onclick contains the category
        if (btn.getAttribute('onclick').includes(`'${category}'`)) {
            btn.classList.add('active', 'bg-white/10', 'text-white', 'border-white/5');
            btn.classList.remove('text-gray-400', 'border-transparent');
        } else {
            btn.classList.remove('active', 'bg-white/10', 'text-white', 'border-white/5');
            btn.classList.add('text-gray-400', 'border-transparent');
        }
    });

    renderShop(category);
}

/**
 * Open Brand Selection Modal
 */
function openBrandModal(brandId) {
    currentBrand = shopBrands.find(b => b.id === brandId);
    if (!currentBrand) return;

    selectedDenomination = null;

    // Generate Modal Content
    const content = `
        <div class="text-center mb-6">
            <div class="w-24 h-24 mx-auto mb-4 p-4 bg-loot-card rounded-full border border-white/10">
                <img src="${currentBrand.image}" alt="${currentBrand.name}" class="w-full h-full object-contain">
            </div>
            <h3 class="text-2xl font-bold font-display text-white mb-2" data-i18n="shop_select_amount">Select Amount</h3>
            <p class="text-gray-400 text-sm">Choose the value of your gift card</p>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-8">
            ${currentBrand.denominations.map(denom => `
                <button onclick="selectDenomination('${denom.id}')" 
                        id="denom-${denom.id}"
                        class="denom-btn relative p-4 rounded-xl border border-white/10 bg-loot-dark hover:bg-loot-card transition-all text-center group">
                    <div class="text-lg font-bold text-white mb-1">${denom.amount}</div>
                    <div class="text-sm font-mono text-loot-gold">${denom.price} PTS</div>
                    <div class="absolute inset-0 border-2 border-loot-neon rounded-xl opacity-0 scale-95 transition-all" id="ring-${denom.id}"></div>
                </button>
            `).join('')}
        </div>

        <div class="border-t border-white/10 pt-6">
            <div class="flex justify-between items-center mb-6">
                <span class="text-gray-400" data-i18n="shop_total_cost">Total Cost</span>
                <span class="text-2xl font-bold text-loot-neon font-mono" id="selected-price">0 PTS</span>
            </div>
            
            <button onclick="confirmWithdrawal()" 
                    id="withdraw-btn"
                    disabled
                    class="w-full py-4 rounded-xl font-bold text-lg bg-gray-700 text-gray-400 cursor-not-allowed transition-all">
                <span data-i18n="shop_select_option">Select an option</span>
            </button>
        </div>

        <!-- Delivery Info -->
        <div class="mt-4 text-center">
            <p class="text-xs text-gray-400 flex items-center justify-center gap-1">
                <i data-lucide="clock" class="w-3 h-3"></i>
                <span>Délai : 24h (7 jours pour le 1er retrait)</span>
            </p>
        </div>
    `;

    openModal(currentBrand.name, content);

    // Re-initialize icons for the new modal content (if lucide is loaded)
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Apply translations to the new content
    if (window.LanguageManager) {
        window.LanguageManager.updatePage();
    }
}

/**
 * Handle Denomination Selection
 */
function selectDenomination(denomId) {
    if (!currentBrand) return;

    selectedDenomination = currentBrand.denominations.find(d => d.id === denomId);
    if (!selectedDenomination) return;

    // Update UI highlighting
    document.querySelectorAll('.denom-btn').forEach(btn => {
        btn.classList.remove('bg-loot-card', 'border-loot-neon');
        btn.classList.add('bg-loot-dark', 'border-white/10');
    });

    // Hide all selection rings
    document.querySelectorAll('[id^="ring-"]').forEach(el => el.classList.remove('opacity-100', 'scale-100'));

    // Highlight selected
    const selectedBtn = document.getElementById(`denom-${denomId}`);
    const selectedRing = document.getElementById(`ring-${denomId}`);

    if (selectedBtn) {
        selectedBtn.classList.remove('bg-loot-dark', 'border-white/10');
        selectedBtn.classList.add('bg-loot-card', 'border-loot-neon');
    }

    if (selectedRing) {
        selectedRing.classList.add('opacity-100', 'scale-100');
    }

    // Update Price Display
    const priceDisplay = document.getElementById('selected-price');
    if (priceDisplay) priceDisplay.textContent = `${selectedDenomination.price} PTS`;

    // Enable/Disable Withdraw Button based on user balance
    updateWithdrawButton();
}

/**
 * Update Withdraw Button State
 */
function updateWithdrawButton() {
    const btn = document.getElementById('withdraw-btn');
    if (!btn || !selectedDenomination) return;

    // Check user balance (assumed global variable or accessible via DOM)
    // For now, we'll check the text content of the balance display or default to 0
    const balanceEl = document.getElementById('user-balance');
    const currentBalance = balanceEl ? parseInt(balanceEl.textContent.replace(/\s/g, '')) : 0;

    if (currentBalance >= selectedDenomination.price) {
        btn.disabled = false;
        btn.classList.remove('bg-gray-700', 'text-gray-400', 'cursor-not-allowed');
        btn.classList.add('bg-gradient-to-r', 'from-loot-neon', 'to-loot-purple', 'text-white', 'cursor-pointer', 'hover:opacity-90');
        btn.textContent = 'REDEEM REWARD';
    } else {
        btn.disabled = true;
        btn.classList.add('bg-gray-700', 'text-gray-400', 'cursor-not-allowed');
        btn.classList.remove('bg-gradient-to-r', 'from-loot-neon', 'to-loot-purple', 'text-white', 'cursor-pointer', 'hover:opacity-90');
        const needed = selectedDenomination.price - currentBalance;
        btn.textContent = `Need ${needed.toLocaleString()} more points`;
    }
}

/**
 * Process Withdrawal
 */
async function confirmWithdrawal() {
    if (!selectedDenomination) return;

    // Show loading state
    const btn = document.getElementById('withdraw-btn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"></div>';

    try {
        // Build headers - include token if Firebase user is logged in
        const headers = {
            'Content-Type': 'application/json'
        };

        // Check if Firebase auth is available and user is logged in
        const firebaseUser = firebase.auth().currentUser;
        if (firebaseUser) {
            const token = await firebaseUser.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/withdraw', {
            method: 'POST',
            credentials: 'include', // Important for session cookies (Discord/OAuth users)
            headers: headers,
            body: JSON.stringify({
                rewardId: selectedDenomination.id
            })
        });

        const data = await response.json();

        if (data.success) {
            closeModal();

            // Get user email from Firebase or state
            const userEmail = firebaseUser?.email || state?.user?.email || 'your email';

            // Show Success Modal
            openModal('Reward Claimed!', `
                <div class="text-center py-6">
                    <div class="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i data-lucide="check" class="w-10 h-10 text-green-500"></i>
                    </div>
                    <h3 class="text-2xl font-bold text-white mb-2">Success!</h3>
                    <p class="text-gray-400 mb-6">You successfully redeemed <strong>${selectedDenomination.amount}</strong>.</p>
                    <div class="bg-loot-dark p-4 rounded-xl border border-white/10 mb-6">
                        <p class="text-sm text-gray-500 mb-1">Your code will be sent to:</p>
                        <p class="text-white font-mono">${userEmail}</p>
                    </div>
                    <button onclick="closeModal()" class="w-full btn-neon py-3 rounded-xl font-bold">Awesome!</button>
                </div>
            `);

            // Update balance UI
            updateBalanceUI(data.newBalance);

        } else if (data.code === 'PERSONAL_INFO_REQUIRED' || data.needsPersonalInfo) {
            // Show Personal Info Modal
            showPersonalInfoModal();
        } else {
            // Show Error
            showToast(data.error || 'Transaction failed', 'error');
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        console.error('Withdraw error:', error);
        showToast('Connection error. Please try again.', 'error');
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

/**
 * Show Personal Info Modal for KYC (first withdrawal)
 */
function showPersonalInfoModal() {
    const content = `
        <div class="text-center mb-6">
            <div class="w-16 h-16 bg-loot-purple/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i data-lucide="user-check" class="w-8 h-8 text-loot-purple"></i>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">Informations Personnelles</h3>
            <p class="text-gray-400 text-sm">Pour votre premier retrait, nous avons besoin de quelques informations.</p>
        </div>

        <form id="personal-info-form" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Prénom *</label>
                    <input type="text" name="firstName" required minlength="2" maxlength="50"
                           class="w-full px-4 py-3 bg-loot-dark border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-loot-neon focus:outline-none transition"
                           placeholder="Jean">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Nom *</label>
                    <input type="text" name="lastName" required minlength="2" maxlength="50"
                           class="w-full px-4 py-3 bg-loot-dark border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-loot-neon focus:outline-none transition"
                           placeholder="Dupont">
                </div>
            </div>

            <div>
                <label class="block text-xs text-gray-400 mb-1">Adresse *</label>
                <input type="text" name="address" required minlength="5" maxlength="200"
                       class="w-full px-4 py-3 bg-loot-dark border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-loot-neon focus:outline-none transition"
                       placeholder="123 Rue de la Paix">
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Ville *</label>
                    <input type="text" name="city" required minlength="2" maxlength="100"
                           class="w-full px-4 py-3 bg-loot-dark border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-loot-neon focus:outline-none transition"
                           placeholder="Paris">
                </div>
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Code Postal *</label>
                    <input type="text" name="postalCode" required minlength="3" maxlength="20"
                           class="w-full px-4 py-3 bg-loot-dark border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-loot-neon focus:outline-none transition"
                           placeholder="75001">
                </div>
            </div>

            <div>
                <label class="block text-xs text-gray-400 mb-1">Pays *</label>
                <select name="country" required
                        class="w-full px-4 py-3 bg-loot-dark border border-white/10 rounded-xl text-white focus:border-loot-neon focus:outline-none transition">
                    <option value="">Sélectionnez votre pays</option>
                    <option value="France">France</option>
                    <option value="Belgique">Belgique</option>
                    <option value="Suisse">Suisse</option>
                    <option value="Canada">Canada</option>
                    <option value="Luxembourg">Luxembourg</option>
                    <option value="Monaco">Monaco</option>
                    <option value="Autre">Autre</option>
                </select>
            </div>

            <div id="personal-info-error" class="text-red-400 text-sm hidden"></div>

            <button type="submit" id="save-info-btn"
                    class="w-full py-4 mt-4 rounded-xl font-bold text-lg bg-gradient-to-r from-loot-neon to-loot-purple text-white hover:opacity-90 transition">
                Confirmer et Continuer
            </button>
        </form>

        <p class="text-xs text-gray-500 text-center mt-4">
            <i data-lucide="lock" class="w-3 h-3 inline"></i>
            Vos données sont sécurisées et utilisées uniquement pour la livraison.
        </p>
    `;

    openModal('Vérification Requise', content);

    // Re-initialize icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }

    // Handle form submission
    setTimeout(() => {
        const form = document.getElementById('personal-info-form');
        if (form) {
            form.addEventListener('submit', handlePersonalInfoSubmit);
        }
    }, 100);
}

/**
 * Handle Personal Info Form Submission
 */
async function handlePersonalInfoSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const btn = document.getElementById('save-info-btn');
    const errorDiv = document.getElementById('personal-info-error');

    // Get form data
    const formData = new FormData(form);
    const data = {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        address: formData.get('address'),
        city: formData.get('city'),
        postalCode: formData.get('postalCode'),
        country: formData.get('country')
    };

    // Show loading
    btn.disabled = true;
    btn.innerHTML = '<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"></div>';

    try {
        // Build headers
        const headers = { 'Content-Type': 'application/json' };
        const firebaseUser = firebase.auth().currentUser;
        if (firebaseUser) {
            const token = await firebaseUser.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/user/personal-info', {
            method: 'POST',
            credentials: 'include',
            headers: headers,
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // Close modal and retry withdrawal
            closeModal();
            showToast('Informations enregistrées!', 'success');

            // Re-open brand modal to continue withdrawal
            if (currentBrand) {
                setTimeout(() => {
                    openBrandModal(currentBrand.id);
                    // Re-select the denomination if one was selected
                    if (selectedDenomination) {
                        setTimeout(() => selectDenomination(selectedDenomination.id), 200);
                    }
                }, 500);
            }
        } else {
            errorDiv.textContent = result.error || 'Erreur lors de la sauvegarde';
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Confirmer et Continuer';
        }
    } catch (error) {
        console.error('Personal info submit error:', error);
        errorDiv.textContent = 'Erreur de connexion. Veuillez réessayer.';
        errorDiv.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Confirmer et Continuer';
    }
}
