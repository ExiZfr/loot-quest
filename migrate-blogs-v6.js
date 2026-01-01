/**
 * Migration Script v6: Add horizontal banner placeholder in middle of articles
 * 
 * Run: node migrate-blogs-v6.js
 */

const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'public', 'blog');

// Horizontal banner placeholder
const horizontalBanner = `
            <!-- HORIZONTAL AD BANNER PLACEHOLDER (728x90) -->
            <div class="ad-banner-horizontal my-8 p-4 rounded-xl border-2 border-dashed border-indigo-500/30 bg-indigo-500/5 text-center">
                <p class="text-indigo-400 font-bold text-sm">📢 ESPACE PUBLICITAIRE (728x90)</p>
                <p class="text-gray-500 text-xs mt-1">Votre pub ici</p>
            </div>
`;

let migratedCount = 0;

const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
console.log(`\n🔄 Found ${files.length} blog files to add horizontal banner...\n`);

files.forEach(file => {
    const filePath = path.join(blogDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has horizontal banner
    if (content.includes('ad-banner-horizontal')) {
        console.log(`⏭️  Already has banner: ${file}`);
        return;
    }

    // Find second <h2> tag and insert banner before it
    let h2Count = 0;
    let modified = false;

    content = content.replace(/<h2[^>]*>/gi, (match) => {
        h2Count++;
        if (h2Count === 2 && !modified) {
            modified = true;
            return horizontalBanner + '\n            ' + match;
        }
        return match;
    });

    // If we couldn't find 2 h2 tags, try inserting after middle paragraph
    if (!modified) {
        const paragraphs = content.match(/<\/p>/g);
        if (paragraphs && paragraphs.length >= 6) {
            let pCount = 0;
            const midPoint = Math.floor(paragraphs.length / 2);
            content = content.replace(/<\/p>/g, (match) => {
                pCount++;
                if (pCount === midPoint && !modified) {
                    modified = true;
                    return match + '\n' + horizontalBanner;
                }
                return match;
            });
        }
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ Added horizontal banner: ${file}`);
        migratedCount++;
    } else {
        console.log(`⚠️  Could not find insertion point: ${file}`);
    }
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Migration Complete!`);
console.log(`   ✅ Updated: ${migratedCount} files`);
console.log(`${'═'.repeat(50)}\n`);
