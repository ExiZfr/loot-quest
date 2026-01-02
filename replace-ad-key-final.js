const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'public', 'blog');
const OLD_KEY = '554cc210c2e77cdd100f08302332b526';
const NEW_KEY = '04fd781b0eb1941ea4c90137e7a213bc';

const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));

console.log(`Found ${blogFiles.length} blog files`);
console.log(`Replacing key: ${OLD_KEY} → ${NEW_KEY}\n`);

let modifiedCount = 0;

blogFiles.forEach(file => {
    const filePath = path.join(BLOG_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes(OLD_KEY)) {
        content = content.replaceAll(OLD_KEY, NEW_KEY);
        fs.writeFileSync(filePath, content, 'utf8');
        modifiedCount++;
        console.log(`✅ ${file}`);
    }
});

console.log(`\n✅ Updated ${modifiedCount}/${blogFiles.length} files`);
