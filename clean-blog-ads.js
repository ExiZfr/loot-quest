const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'public', 'blog');

// Read all HTML files in blog directory
const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));

console.log(`Found ${blogFiles.length} blog files`);

let modifiedCount = 0;

blogFiles.forEach(file => {
    const filePath = path.join(BLOG_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove the horizontal banner in middle (lines 157-169 approximately)
    // Pattern: ad-container with atOptions key 04fd781b0eb1941ea4c90137e7a213bc (bad placement)
    const pattern1 = /<!-- Horizontal Ad Banner \(In-Article\) -->[\s\S]*?<div class="ad-container my-8">[\s\S]*?atOptions = \{[\s\S]*?'key' : '04fd781b0eb1941ea4c90137e7a213bc'[\s\S]*?<\/script>[\s\S]*?<\/div>/g;

    // Remove the 320x50 horizontal banner
    const pattern2 = /<!-- HORIZONTAL AD BANNER \(320x50\) -->[\s\S]*?<div class="ad-banner-horizontal my-8 flex justify-center">[\s\S]*?atOptions = \{[\s\S]*?'key' : 'a40dcfff0399edf6a8cee9ced4923cde'[\s\S]*?<\/script>[\s\S]*?<\/div>/g;

    let newContent = content;
    newContent = newContent.replace(pattern1, '');
    newContent = newContent.replace(pattern2, '');

    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        modifiedCount++;
        console.log(`✅ Cleaned: ${file}`);
    } else {
        console.log(`⏭️  Skipped (no ads found): ${file}`);
    }
});

console.log(`\n✅ Migration complete! Modified ${modifiedCount}/${blogFiles.length} files`);
console.log('Kept only left & right 160x600 sidebars');
