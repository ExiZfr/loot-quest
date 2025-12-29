const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// 🚀 LOOTQUEST BLOG GENERATOR - Gemini API Edition
// Generates bilingual (FR/EN) blog posts automatically
// ═══════════════════════════════════════════════════════════════

const GEMINI_API_KEY = 'AIzaSyALSN3YDhg7JUZLLc_maWzNzyvXs63VZe0';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';

// Topics to generate blogs for
const topics = [
    { keyword: "PlayStation Store Gift Cards", category: "PlayStation", icon: "�", gradient: "from-blue-900/50 to-indigo-900/50" },
    { keyword: "Xbox Gift Cards", category: "Xbox", icon: "🟢", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Nintendo eShop Cards", category: "Nintendo", icon: "🍄", gradient: "from-red-900/50 to-white/50" },
    { keyword: "Robux Roblox", category: "Roblox", icon: "🎲", gradient: "from-red-900/50 to-gray-900/50" },
    { keyword: "V-Bucks Fortnite", category: "Fortnite", icon: "🔫", gradient: "from-purple-900/50 to-blue-900/50" },
    { keyword: "Genshin Impact Primogems", category: "Genshin", icon: "💎", gradient: "from-purple-900/50 to-cyan-900/50" },
    { keyword: "Valorant Points VP", category: "Valorant", icon: "🎯", gradient: "from-red-900/50 to-black/50" },
    { keyword: "Minecraft Minecoins", category: "Minecraft", icon: "⛏️", gradient: "from-green-800/50 to-brown-900/50" },
    { keyword: "Apex Legends Coins", category: "Apex", icon: "🔥", gradient: "from-red-900/50 to-orange-900/50" },
    { keyword: "League of Legends RP", category: "LoL", icon: "⚔️", gradient: "from-blue-900/50 to-gold-900/50" }
];

// HTML Template - Matches existing blog pages exactly
const htmlTemplate = (lang, title, metaDesc, category, h1, date, leadIntro, content, ctaTitle, ctaText, ctaButton) => `<!DOCTYPE html>
<html lang="${lang}" class="dark">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - LootQuest</title>
    <meta name="description"
        content="${metaDesc}">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = { darkMode: 'class', theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'], display: ['Outfit', 'sans-serif'] }, colors: { background: '#0B0E14', surface: '#151A23', primary: '#6366f1', accent: '#10b981' } } } }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@700&display=swap"
        rel="stylesheet">
    <style>
        body {
            background-color: #0B0E14;
            color: #E2E8F0;
        }

        .prose {
            max-width: 65ch;
            margin: 0 auto;
            line-height: 1.7;
        }

        .prose h2 {
            font-family: 'Outfit', sans-serif;
            font-weight: 700;
            margin-top: 3rem;
            margin-bottom: 1rem;
            font-size: 1.8rem;
            color: #fff;
        }

        .prose h3 {
            font-family: 'Outfit', sans-serif;
            font-weight: 600;
            margin-top: 2rem;
            margin-bottom: 0.75rem;
            font-size: 1.4rem;
            color: #e0e7ff;
        }

        .prose p {
            margin-bottom: 1.5rem;
            color: #94a3b8;
        }

        .prose ul {
            list-style-type: disc;
            padding-left: 1.5rem;
            margin-bottom: 1.5rem;
            color: #94a3b8;
        }

        .prose strong {
            color: #818cf8;
            font-weight: 600;
        }

        .prose a {
            color: #818cf8;
            text-decoration: underline;
            text-underline-offset: 4px;
        }

        .glass-panel {
            background: rgba(21, 26, 35, 0.8);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
    </style>
</head>

<body class="min-h-screen flex flex-col">
    <nav class="sticky top-0 z-50 glass-panel border-b border-white/5 bg-[#0B0E14]/80">
        <div class="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/blog.html" class="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">←
                ${lang === 'fr' ? 'Retour au Blog' : 'Back to Blog'}</a>
            <a href="/dashboard.html" class="text-sm font-bold text-indigo-400 hover:text-indigo-300">${lang === 'fr' ? 'Mon Compte' : 'My Account'}</a>
        </div>
    </nav>

    <header class="py-16 px-6 text-center max-w-4xl mx-auto">
        <span
            class="px-3 py-1 rounded bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-6 inline-block">${category}</span>
        <h1 class="font-display font-bold text-4xl md:text-5xl text-white mb-6 leading-tight">${h1}</h1>
        <div class="flex items-center justify-center gap-4 text-sm text-gray-500">
            <span>${lang === 'fr' ? 'Par L\'équipe LootQuest' : 'By LootQuest Team'}</span> • <span>${date}</span>
        </div>
    </header>

    <main class="flex-1 px-6 pb-20">
        <article class="prose glass-panel p-8 md:p-12 rounded-3xl">
            <p class="lead text-xl text-gray-300 mb-8 border-l-4 border-indigo-500 pl-4 italic">
                ${leadIntro}
            </p>

${content}

            <div class="bg-indigo-600/20 border border-indigo-500 rounded-2xl p-8 text-center mt-12">
                <h3 class="!mt-0 !text-indigo-300">${ctaTitle}</h3>
                <p class="text-white">${ctaText}</p>
                <a href="/dashboard.html"
                    class="inline-block mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl no-underline transition-transform hover:scale-105">
                    ${ctaButton} →
                </a>
            </div>
        </article>
    </main>
    <footer class="text-center py-8 text-gray-600 text-sm">
        <p>&copy; 2025 LootQuest.</p>
    </footer>
</body>

</html>`;

// Slugify function
function slugify(text) {
    return text.toLowerCase()
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[ìíîï]/g, 'i')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

// Call Gemini API
async function callGemini(prompt) {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.9,
                maxOutputTokens: 4096,
            }
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// Generate blog content
async function generateBlogContent(keyword, lang) {
    const langName = lang === 'fr' ? 'French' : 'English';
    const prompt = `You are a Gen Z gaming blogger writing for LootQuest, a legitimate rewards platform where gamers earn gift cards by completing offers.

Write a blog post in ${langName} about "${keyword}" - specifically how to get them for FREE using LootQuest.

IMPORTANT: Respond ONLY with a valid JSON object (no markdown, no code blocks). Use this exact structure:
{
    "title": "SEO title (60 chars max)",
    "metaDescription": "Meta description (155 chars max)",
    "h1": "Catchy H1 headline without emoji",
    "leadIntro": "A short italic intro paragraph (1-2 sentences) that hooks the reader. Example: Stop searching for generators. Here is how to get real codes legitimately.",
    "content": "The main article content with proper HTML formatting. Use \\n for newlines between paragraphs.",
    "ctaTitle": "${lang === 'fr' ? 'Arrêtez de chercher des hacks' : 'Stop Searching for Hacks'}",
    "ctaText": "${lang === 'fr' ? 'Gagnez vos récompenses honnêtement et rapidement.' : 'Earn your rewards honestly and quickly.'}",
    "ctaButton": "${lang === 'fr' ? 'COMMENCER MAINTENANT' : 'START EARNING NOW'}"
}

CONTENT FORMATTING RULES:
- Write 400-600 words
- Format the content with proper HTML on separate lines like this:
  <p>First paragraph text here.</p>
  
  <h2>Section Title</h2>
  <p>Section content here with <strong>bold text</strong> for emphasis.</p>
  
  <ul>
      <li><strong>Step 1:</strong> Description here.</li>
      <li><strong>Step 2:</strong> Description here.</li>
  </ul>

- Include 2-3 <h2> sections
- Include at least one <ul> list with steps
- Use <strong> for important terms like "LootQuest"
- Be energetic but professional
- Warn against scam generators
- Explain the LootQuest method clearly
- The JSON must be valid and parseable`;

    const response = await callGemini(prompt);

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error('Failed to parse JSON:', jsonStr.substring(0, 200));
        throw new Error('Invalid JSON from Gemini');
    }
}

// Generate a single blog post
async function generateBlog(topic, lang, id) {
    console.log(`\n🔄 Generating ${lang.toUpperCase()}: ${topic.keyword}...`);

    const content = await generateBlogContent(topic.keyword, lang);
    const date = lang === 'fr'
        ? new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const slug = lang === 'fr'
        ? slugify(content.title) + '-fr'
        : slugify(content.title) + '-en';

    // Generate HTML file
    const html = htmlTemplate(
        lang,
        content.title,
        content.metaDescription,
        topic.category,
        content.h1,
        date,
        content.leadIntro,
        content.content,
        content.ctaTitle,
        content.ctaText,
        content.ctaButton
    );

    const filePath = path.join(__dirname, 'public', 'blog', `${slug}.html`);
    fs.writeFileSync(filePath, html);
    console.log(`   ✅ Created: ${slug}.html`);

    // Return blog-data.js entry
    return {
        id,
        title: content.title,
        excerpt: content.metaDescription,
        category: topic.category,
        readTime: lang === 'fr' ? '5 min' : 'English',
        date,
        image: null,
        gradient: topic.gradient,
        icon: topic.icon,
        lang,
        slug
    };
}

// Main execution
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🚀 LOOTQUEST BLOG GENERATOR');
    console.log('═══════════════════════════════════════════════════\n');

    const blogEntries = [];
    let currentId = 100; // Start from 100 to avoid conflicts

    for (const topic of topics) {
        try {
            // Generate French version
            const frEntry = await generateBlog(topic, 'fr', currentId++);
            blogEntries.push(frEntry);

            // Wait 3 seconds between requests
            console.log('   ⏳ Waiting 3s...');
            await new Promise(r => setTimeout(r, 3000));

            // Generate English version
            const enEntry = await generateBlog(topic, 'en', currentId++);
            blogEntries.push(enEntry);

            // Wait 3 seconds before next topic
            console.log('   ⏳ Waiting 3s before next topic...');
            await new Promise(r => setTimeout(r, 3000));

        } catch (error) {
            console.error(`   ❌ Error for ${topic.keyword}: ${error.message}`);
        }
    }

    // Output blog-data.js entries
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📋 ADD THIS TO public/js/blog-data.js:');
    console.log('═══════════════════════════════════════════════════\n');

    const jsOutput = blogEntries.map(e => `    {
        id: ${e.id},
        title: "${e.title.replace(/"/g, '\\"')}",
        excerpt: "${e.excerpt.replace(/"/g, '\\"')}",
        category: "${e.category}",
        readTime: "${e.readTime}",
        date: "${e.date}",
        image: null,
        gradient: "${e.gradient}",
        icon: "${e.icon}",
        lang: "${e.lang}"
    }`).join(',\n');

    console.log(jsOutput);

    // Save to a file for easy copy-paste
    fs.writeFileSync(
        path.join(__dirname, 'generated-blog-entries.js'),
        `// Generated blog entries - Add these to blogPosts array in public/js/blog-data.js\n\nconst newEntries = [\n${jsOutput}\n];\n`
    );

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`✅ DONE! Generated ${blogEntries.length} blog posts.`);
    console.log('� Entries saved to: generated-blog-entries.js');
    console.log('═══════════════════════════════════════════════════\n');
}

main().catch(console.error);
