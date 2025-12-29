import { blogPosts, categories } from `./blog-data.js?v=${Date.now()}`;

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

    getFilteredPosts() {
        return blogPosts.filter(post => {
            const matchesSearch =
                post.title.toLowerCase().includes(this.searchQuery) ||
                post.excerpt.toLowerCase().includes(this.searchQuery);

            const matchesCategory =
                this.currentFilter === 'all' ||
                post.category === this.currentFilter;

            return matchesSearch && matchesCategory;
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

        this.grid.innerHTML = posts.map((post, index) => `
            <article 
                class="group relative h-full glass-panel rounded-3xl overflow-hidden hover:scale-[1.02] transition-all duration-500 border border-white/5 hover:border-loot-neon/30 hover:shadow-[0_0_30px_-5px_rgba(0,243,255,0.15)] flex flex-col"
                style="animation-delay: ${index * 50}ms; opacity: 0; animation: fadeInUp 0.5s forwards ${index * 0.05}s;"
            >
                <a href="#" class="absolute inset-0 z-10"></a>
                
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
        `).join('');

        lucide.createIcons();
    }

    animateEntrance() {
        // Handled via CSS keyframes in the main file
    }
}

// Global expose for onclick handlers
window.blogEngine = new BlogEngine();
