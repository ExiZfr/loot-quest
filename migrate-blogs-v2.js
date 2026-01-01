/**
 * Migration Script v2: Add ads WITHOUT breaking the design
 * - Keeps original centered layout
 * - Adds 2 vertical skyscraper ads on sides (desktop only)
 * - Adds 1 horizontal banner in the middle of article content
 * 
 * Run: node migrate-blogs-v2.js
 */

const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'public', 'blog');

// CSS for ads (added to <style>)
const adStyles = `

        /* === AD STYLES === */
        .page-wrapper {
            display: flex;
            justify-content: center;
            gap: 1rem;
        }

        .ad-sidebar {
            width: 160px;
            flex-shrink: 0;
            display: none;
        }

        /* Show sidebars only on large screens */
        @media (min-width: 1200px) {
            .ad-sidebar {
                display: block;
            }
        }

        .ad-vertical {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
            border: 1px dashed rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            min-height: 600px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: sticky;
            top: 100px;
            writing-mode: vertical-lr;
            text-orientation: mixed;
            font-size: 14px;
            font-weight: bold;
            color: rgba(99, 102, 241, 0.6);
        }

        .ad-horizontal {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
            border: 1px dashed rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            min-height: 90px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 2rem 0;
            font-size: 14px;
            font-weight: bold;
            color: rgba(99, 102, 241, 0.6);
        }

        .main-content {
            flex: 1;
            max-width: 900px;
            min-width: 0;
        }
`;

// Left sidebar HTML
const leftSidebar = `
    <!-- Left Ad Sidebar -->
    <aside class="ad-sidebar">
        <div class="ad-vertical">PUB VERTICALE (160x600)</div>
    </aside>
`;

// Right sidebar HTML
const rightSidebar = `
    <!-- Right Ad Sidebar -->
    <aside class="ad-sidebar">
        <div class="ad-vertical">PUB VERTICALE (160x600)</div>
    </aside>
`;

// Horizontal ad (to insert in middle of article)
const horizontalAd = `
            <!-- Horizontal Ad Banner -->
            <div class="ad-horizontal">BANNIÈRE PUBLICITAIRE (728x90)</div>
`;

let migratedCount = 0;
let skippedCount = 0;

// Get all HTML files
const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
console.log(`\n🔄 Found ${files.length} blog files to migrate...\n`);

files.forEach(file => {
    const filePath = path.join(blogDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip already migrated files (check for our new markers)
    if (content.includes('page-wrapper') || content.includes('ad-sidebar')) {
        console.log(`⏭️  Skipping (already migrated): ${file}`);
        skippedCount++;
        return;
    }

    // 1. Add ad styles before </style>
    content = content.replace('</style>', adStyles + '\n    </style>');

    // 2. Wrap body content with page-wrapper and sidebars
    // Find <body...> opening and add wrapper
    content = content.replace(
        /<body([^>]*)>/,
        `<body$1>\n<div class="page-wrapper">\n${leftSidebar}\n    <div class="main-content">`
    );

    // Find </body> and close wrapper
    content = content.replace(
        /<\/body>/,
        `    </div>\n${rightSidebar}\n</div>\n</body>`
    );

    // 3. Add horizontal ad in the middle of the article
    // Find the second <h2> tag and insert ad before it
    let h2Count = 0;
    content = content.replace(/<h2>/g, (match) => {
        h2Count++;
        if (h2Count === 2) {
            return horizontalAd + '\n            <h2>';
        }
        return match;
    });

    // If no second h2, try inserting after first half of paragraphs
    if (h2Count < 2) {
        const paragraphs = content.match(/<\/p>/g);
        if (paragraphs && paragraphs.length >= 4) {
            let pCount = 0;
            const midPoint = Math.floor(paragraphs.length / 2);
            content = content.replace(/<\/p>/g, (match) => {
                pCount++;
                if (pCount === midPoint) {
                    return match + '\n' + horizontalAd;
                }
                return match;
            });
        }
    }

    // Save migrated file
    fs.writeFileSync(filePath, content);
    console.log(`✅ Migrated: ${file}`);
    migratedCount++;
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Migration Complete!`);
console.log(`   ✅ Migrated: ${migratedCount} files`);
console.log(`   ⏭️  Skipped: ${skippedCount} files`);
console.log(`${'═'.repeat(50)}\n`);
