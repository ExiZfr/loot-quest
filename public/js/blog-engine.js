import { blogPosts, categories } from './blog-data.js';

class BlogEngine {
    constructor() {
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.grid = document.getElementById('blog-grid');
        this.filterContainer = document.getElementById('filter-container');
        this.searchInput = document.getElementById('search-input');

        this.init();
    }

    init() {
        this.renderFilters();
        this.renderGrid();
        this.setupEventListeners();
        this.animateEntrance();
    }

    setupEventListeners() {
        // Search
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderGrid();
        });

        // Search clear/focus effects would go here if not handled by CSS/Tailwind
    }

    renderFilters() {
        this.filterContainer.innerHTML = categories.map(cat => `
            <button 
                onclick="window.blogEngine.setFilter('${cat.id}')"
                class="filter-pill ${this.currentFilter === cat.id ? 'active' : ''} whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all duration-300 border border-white/5 flex items-center gap-2 group hover:border-loot-neon/50"
                data-id="${cat.id}"
            >
                <i data-lucide="${cat.icon}" class="w-4 h-4 ${this.currentFilter === cat.id ? 'text-black' : 'text-gray-400 group-hover:text-loot-neon'}"></i>
                <span class="${this.currentFilter === cat.id ? 'text-black' : 'text-gray-400 group-hover:text-white'}">${cat.label}</span>
            </button>
        `).join('');
        lucide.createIcons();
    }

    setFilter(filterId) {
        this.currentFilter = filterId;
        this.renderFilters(); // Re-render to update active state
        this.renderGrid();
    }

    parseDate(dateStr) {
        // Parse French dates like "29 déc. 2025" or English "Dec 29, 2025"
        const months = {
            'jan': 0, 'fév': 1, 'mar': 2, 'avr': 3, 'mai': 4, 'juin': 5,
            'juil': 6, 'août': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'déc': 11,
            'jan.': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
        };

        const parts = dateStr.toLowerCase().replace(/\./g, '').split(' ');
        if (parts.length >= 3) {
            const day = parseInt(parts[0]);
            const month = months[parts[1]] || 0;
            const year = parseInt(parts[2]);
            return new Date(year, month, day);
        }
        return new Date(0); // Fallback to epoch if parsing fails
    }

    getFilteredPosts() {
        const filtered = blogPosts.filter(post => {
            const matchesSearch =
                post.title.toLowerCase().includes(this.searchQuery) ||
                post.excerpt.toLowerCase().includes(this.searchQuery);

            const matchesCategory =
                this.currentFilter === 'all' ||
                post.category === this.currentFilter;

            return matchesSearch && matchesCategory;
        });

        // Sort by date (newest first)
        return filtered.sort((a, b) => {
            const dateA = this.parseDate(a.date);
            const dateB = this.parseDate(b.date);
            return dateB - dateA; // Descending order (newest first)
        });
    }

    renderGrid() {
        const posts = this.getFilteredPosts();

        if (posts.length === 0) {
            this.grid.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-20 text-center opacity-0 animate-fade-in-up">
                    <div class="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <i data-lucide="search-x" class="w-10 h-10 text-gray-500"></i>
                    </div>
                    <h3 class="text-2xl font-display font-bold text-white mb-2">Aucun résultat</h3>
                    <p class="text-gray-400">Essayez une autre recherche ou catégorie.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        this.grid.innerHTML = posts.map((post, index) => {
            // Determine URL: Use explicit slug if available, otherwise generate it
            const slug = post.slug || (this.slugify(post.title) + '-' + post.lang);
            const postUrl = `/blog/${slug}.html`;

            return `
            <article 
                class="group relative h-full glass-panel rounded-3xl overflow-hidden hover:scale-[1.02] transition-all duration-500 border border-white/5 hover:border-loot-neon/30 hover:shadow-[0_0_30px_-5px_rgba(0,243,255,0.15)] flex flex-col"
                style="animation-delay: ${index * 50}ms; opacity: 0; animation: fadeInUp 0.5s forwards ${index * 0.05}s;"
            >
                <a href="${postUrl}" class="absolute inset-0 z-10"></a>
                
                <!-- Image/Art Section -->
                <div class="relative h-56 overflow-hidden shrink-0">
                    <div class="absolute inset-0 bg-gradient-to-br ${post.gradient} transition-transform duration-700 group-hover:scale-110"></div>
                    
                    ${post.image && !post.icon ? `
                        <img src="${post.image}" alt="${post.category}" class="w-full h-full object-cover opacity-60 mix-blend-overlay transition-transform duration-700 group-hover:scale-110">
                    ` : ''}

                    <div class="absolute inset-0 flex items-center justify-center">
                        ${post.icon ? `<span class="text-6xl font-black text-white/20 select-none transform transition-transform duration-500 group-hover:scale-110 group-hover:text-white/40 group-hover:rotate-6">${post.icon}</span>` : ''}
                    </div>

                    <!-- Floating Badges -->
                    <div class="absolute top-4 left-4 flex gap-2">
                        <span class="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest text-white border border-white/10 shadow-lg">
                            ${post.category}
                        </span>
                        ${post.lang === 'en' ? `
                            <span class="px-2 py-1 bg-blue-500/20 backdrop-blur-md rounded-full text-[10px] font-bold text-blue-300 border border-blue-500/20">
                                EN
                            </span>
                        ` : ''}
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6 flex flex-col flex-1 relative bg-gradient-to-b from-transparent to-black/20">
                    <h2 class="font-display font-bold text-xl md:text-2xl text-white mb-3 leading-[1.1] group-hover:text-loot-neon transition-colors">
                        ${post.title}
                    </h2>
                    
                    <p class="text-gray-400 text-sm leading-relaxed line-clamp-2 md:line-clamp-3 mb-6 flex-1">
                        ${post.excerpt}
                    </p>

                    <!-- Footer -->
                    <div class="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                        <div class="flex items-center gap-2 text-xs font-medium text-gray-500">
                            <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                            <span>${post.readTime}</span>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-medium text-gray-500 group-hover:text-loot-neon transition-colors">
                            <span>Lire l'article</span>
                            <i data-lucide="arrow-right" class="w-3.5 h-3.5 transform transition-transform group-hover:translate-x-1"></i>
                        </div>
                    </div>
                </div>
            </article>
        `}).join('');

        lucide.createIcons();
    }

    slugify(text) {
        return text.toLowerCase()
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }

    animateEntrance() {
        // Handled via CSS keyframes in the main file
    }
}

// Global expose for onclick handlers
window.blogEngine = new BlogEngine();
