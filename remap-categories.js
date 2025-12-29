const fs = require('fs');

// Category mapping from old specific categories to new global ones
const categoryMapping = {
    // Gaming-related
    'Fortnite': 'Gaming',
    'Roblox': 'Gaming',
    'PlayStation': 'Gaming',
    'Xbox': 'Gaming',
    'Nintendo': 'Gaming',
    'Genshin': 'Gaming',
    'Valorant': 'Gaming',
    'Minecraft': 'Gaming',
    'Apex': 'Gaming',
    'LoL': 'Gaming',
    'Steam': 'Gaming',
    'Sports': 'Gaming',
    'Gacha': 'Gaming',

    // Money-related
    'PayPal': 'Money',
    'Argent': 'Money',

    // Mobile gaming
    'Mobile': 'Mobile',
    'Android': 'Mobile',

    // Entertainment
    'Streaming': 'Streaming',
    'Anime': 'Streaming',
    'Music': 'Streaming',
    'Social': 'Streaming',

    // Shopping
    'Shopping': 'Shopping',
    'Apple': 'Shopping',
    'Reviews': 'Shopping',
    'Safety': 'Shopping'
};

const blogDataPath = 'public/js/blog-data.js';

// Read the file
let content = fs.readFileSync(blogDataPath, 'utf8');

// Replace all category values
let replacements = 0;
Object.keys(categoryMapping).forEach(oldCategory => {
    const newCategory = categoryMapping[oldCategory];
    const regex = new RegExp(`category: "${oldCategory}"`, 'g');
    const matches = content.match(regex);
    if (matches) {
        replacements += matches.length;
        content = content.replace(regex, `category: "${newCategory}"`);
        console.log(`✅ ${oldCategory} → ${newCategory} (${matches.length} blogs)`);
    }
});

// Write back
fs.writeFileSync(blogDataPath, content);

console.log(`\n🎯 Total replacements: ${replacements}`);
console.log('✅ Categories remapped successfully!');
