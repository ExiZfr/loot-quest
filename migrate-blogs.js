/**
 * Migration Script: Update existing blogs to 3-column ad layout
 * Run: node migrate-blogs.js
 */

const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'public', 'blog');

// New 3-column CSS styles to inject
const newStyles = `
        /* 3-Column Layout (Desktop) */
        .blog-container {
            display: grid;
            grid-template-columns: 160px 1fr 160px;
            gap: 2rem;
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem 1rem;
        }

        /* Mobile: Stack vertically, pubs visibles */
        @media (max-width: 768px) {
            .blog-container {
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }
            .ad-left { order: 1; }
            .article-content { order: 2; }
            .ad-right { order: 3; }
        }

        /* Pub Skyscraper Style */
        .ad-vertical {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
            border: 1px dashed rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            min-height: 600px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: sticky;
            top: 2rem;
        }

        @media (max-width: 768px) {
            .ad-vertical {
                min-height: 250px;
                position: static;
            }
        }

        .ad-placeholder {
            writing-mode: vertical-lr;
            text-orientation: mixed;
            font-size: 14px;
            font-weight: bold;
            color: rgba(99, 102, 241, 0.6);
        }

        .article-content {
            background: rgba(21, 26, 35, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 24px;
            padding: 3rem 2rem;
        }

        @media (max-width: 768px) {
            .article-content {
                padding: 2rem 1.5rem;
            }
        }`;

// Left ad column HTML
const leftAdHtml = `
        <!-- LEFT AD COLUMN (Skyscraper) -->
        <aside class="ad-left ad-vertical">
            <div class="ad-placeholder">PUB ICI (160x600)</div>
        </aside>

        <!-- CENTER - Article Content -->
        <main class="article-content">`;

// Right ad column HTML
const rightAdHtml = `
        </main>

        <!-- RIGHT AD COLUMN (Skyscraper) -->
        <aside class="ad-right ad-vertical">
            <div class="ad-placeholder">PUB ICI (160x600)</div>
        </aside>`;

let migratedCount = 0;
let skippedCount = 0;

// Get all HTML files
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
console.log(`\n🔄 Found ${files.length} blog files to migrate...\n`);

files.forEach(file => {
    const filePath = path.join(blogDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip already migrated files
    if (content.includes('blog-container') || content.includes('ad-vertical')) {
        console.log(`⏭️  Skipping (already migrated): ${file}`);
        skippedCount++;
        return;
    }

    // 1. Add new styles before </style>
    content = content.replace('</style>', newStyles + '\n    </style>');

    // 2. Wrap content in 3-column layout
    // Find the main content area and wrap it

    // Replace old body structure with new 3-column layout
    // Old: <body class="min-h-screen flex flex-col">
    content = content.replace(
        /<body[^>]*>/,
        '<body>\n    <!-- 3-Column Layout Container -->\n    <div class="blog-container">'
    );

    // Find where main content starts (after nav) and add left ad
    content = content.replace(
        /<\/nav>\s*<header/,
        '</nav>' + leftAdHtml + '\n            <header'
    );

    // Find where main content ends (before footer) and add right ad
    content = content.replace(
        /<\/article>\s*<\/main>\s*<footer/,
        '</article>\n        </main>' + rightAdHtml + '\n    </div>\n\n    <footer'
    );

    // Alternative pattern for different structures
    if (!content.includes('ad-vertical')) {
        // Try wrapping article directly
        content = content.replace(
            /<article class="prose/,
            leftAdHtml.replace('<main class="article-content">', '') + '\n            <article class="prose'
        );

        content = content.replace(
            /<\/article>\s*<\/main>/,
            '</article>' + rightAdHtml.replace('</main>', '')
        );
    }

    // Save migrated file
    fs.writeFileSync(filePath, content);
    console.log(`✅ Migrated: ${file}`);
    migratedCount++;
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Migration Complete!`);
console.log(`   ✅ Migrated: ${migratedCount} files`);
console.log(`   ⏭️  Skipped: ${skippedCount} files (already migrated)`);
console.log(`${'═'.repeat(50)}\n`);
