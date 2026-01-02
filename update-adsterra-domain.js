const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'public', 'blog');
const OLD_DOMAIN = 'highperformanceformat.com';
const NEW_DOMAIN = 'practicalboil.com';

const blogFiles = fs.readdirSync(BLOG_DIR).filter(f => f.endsWith('.html'));

console.log(`Found ${blogFiles.length} blog files`);
console.log(`Replacing domain: ${OLD_DOMAIN} → ${NEW_DOMAIN}\n`);

let modifiedCount = 0;

blogFiles.forEach(file => {
    const filePath = path.join(BLOG_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes(OLD_DOMAIN)) {
        content = content.replaceAll(OLD_DOMAIN, NEW_DOMAIN);
        fs.writeFileSync(filePath, content, 'utf8');
        modifiedCount++;
        console.log(`✅ ${file}`);
    }
});

console.log(`\n✅ Updated ${modifiedCount}/${blogFiles.length} files`);
