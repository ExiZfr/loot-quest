/**
 * Migration Script v5: Integrate real Adsterra ads
 * Replaces placeholder ads with real Adsterra 160x600 skyscraper banners
 * 
 * Run: node migrate-blogs-v5.js
 */

const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'public', 'blog');

// Real Adsterra 160x600 ad code
const adsteraCode = `<div class="ad-container sticky top-24">
            <script type="text/javascript">
                atOptions = {
                    'key' : '04fd781b0eb1941ea4c90137e7a213bc',
                    'format' : 'iframe',
                    'height' : 600,
                    'width' : 160,
                    'params' : {}
                };
            </script>
            <script type="text/javascript" src="https://www.highperformanceformat.com/04fd781b0eb1941ea4c90137e7a213bc/invoke.js"></script>
        </div>`;

let migratedCount = 0;
let skippedCount = 0;

const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
console.log(`\n🔄 Found ${files.length} blog files to update with Adsterra ads...\n`);

files.forEach(file => {
    const filePath = path.join(blogDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has Adsterra code
    if (content.includes('highperformanceformat.com')) {
        console.log(`⏭️  Skipping (already has Adsterra): ${file}`);
        skippedCount++;
        return;
    }

    // Replace placeholder ad divs with real Adsterra code
    // Pattern 1: Left sidebar placeholder
    content = content.replace(
        /<aside class="ad-sidebar[^"]*">\s*<div class="ad-vertical">[^<]*<\/div>\s*<\/aside>/g,
        `<aside class="ad-sidebar hidden lg:block" style="width:160px;flex-shrink:0;">\n        ${adsteraCode}\n    </aside>`
    );

    // Pattern 2: Horizontal ad placeholder (replace with nothing or native banner)
    content = content.replace(
        /<div class="ad-horizontal">[^<]*<\/div>/g,
        '<!-- Ad space -->'
    );

    // Also update CSS to remove placeholder styling if present
    content = content.replace(/\.ad-vertical\s*\{[^}]+\}/g, '');
    content = content.replace(/\.ad-horizontal\s*\{[^}]+\}/g, '');

    // Update aside styling
    content = content.replace(
        /<aside class="ad-sidebar">/g,
        '<aside class="ad-sidebar hidden lg:block" style="width:160px;flex-shrink:0;">'
    );

    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated with Adsterra: ${file}`);
    migratedCount++;
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Migration Complete!`);
console.log(`   ✅ Updated: ${migratedCount} files`);
console.log(`   ⏭️  Skipped: ${skippedCount} files`);
console.log(`${'═'.repeat(50)}\n`);
