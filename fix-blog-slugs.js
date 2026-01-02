const fs = require('fs');
const path = require('path');

const blogDataPath = path.join(__dirname, 'public', 'js', 'blog-data.js');
let content = fs.readFileSync(blogDataPath, 'utf8');

// Function to slugify text
function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Find all blog entries without slug
const regex = /{\s*id:\s*(\d+),\s*title:\s*"([^"]+)",\s*excerpt:\s*"[^"]*",\s*category:\s*"[^"]*",\s*readTime:\s*"[^"]*",\s*date:\s*"[^"]*",\s*(?:timestamp:\s*"[^"]*",\s*)?image:\s*[^,]*,\s*gradient:\s*"[^"]*",\s*icon:\s*[^,]*,\s*lang:\s*"(fr|en)"\s*}/g;

let modified = false;
content = content.replace(regex, (match, id, title, lang) => {
    // Check if slug already exists
    if (match.includes('slug:')) {
        return match;
    }

    modified = true;
    const slug = slugify(title) + `-${lang}`;

    // Insert slug before lang
    const updated = match.replace(
        /lang:\s*"(fr|en)"/,
        `slug: "${slug}",\n        lang: "$1"`
    );

    console.log(`✅ Added slug to ID ${id}: ${slug}`);
    return updated;
});

if (modified) {
    fs.writeFileSync(blogDataPath, content, 'utf8');
    console.log('\n✅ blog-data.js updated with missing slugs!');
} else {
    console.log('✅ All blogs already have slugs!');
}
