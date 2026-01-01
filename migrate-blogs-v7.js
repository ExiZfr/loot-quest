/**
 * Migration Script v7: Replace horizontal placeholder with real Adsterra 320x50 ad
 * 
 * Run: node migrate-blogs-v7.js
 */

const fs = require('fs');
const path = require('path');

const blogDir = path.join(__dirname, 'public', 'blog');

// Real Adsterra 320x50 horizontal ad code
const realAdCode = `<!-- HORIZONTAL AD BANNER (320x50) -->
            <div class="ad-banner-horizontal my-8 flex justify-center">
                <script type="text/javascript">
                    atOptions = {
                        'key' : 'a40dcfff0399edf6a8cee9ced4923cde',
                        'format' : 'iframe',
                        'height' : 50,
                        'width' : 320,
                        'params' : {}
                    };
                </script>
                <script type="text/javascript" src="https://www.highperformanceformat.com/a40dcfff0399edf6a8cee9ced4923cde/invoke.js"></script>
            </div>`;

let migratedCount = 0;
let skippedCount = 0;

const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.html'));
console.log(`\n🔄 Found ${files.length} blog files to update with real horizontal ad...\n`);

files.forEach(file => {
    const filePath = path.join(blogDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has the new ad code
    if (content.includes('a40dcfff0399edf6a8cee9ced4923cde')) {
        console.log(`⏭️  Already has new ad: ${file}`);
        skippedCount++;
        return;
    }

    // Replace the placeholder with real ad code
    const oldPlaceholder = /<\!-- HORIZONTAL AD BANNER PLACEHOLDER \(728x90\) -->[\s\S]*?<\/div>/g;

    if (oldPlaceholder.test(content)) {
        content = content.replace(oldPlaceholder, realAdCode);
        fs.writeFileSync(filePath, content);
        console.log(`✅ Updated with real ad: ${file}`);
        migratedCount++;
    } else {
        console.log(`⚠️  No placeholder found: ${file}`);
    }
});

console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Migration Complete!`);
console.log(`   ✅ Updated: ${migratedCount} files`);
console.log(`   ⏭️  Skipped: ${skippedCount} files`);
console.log(`${'═'.repeat(50)}\n`);
