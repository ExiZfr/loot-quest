const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════
// 🚀 LOOTQUEST AUTO-BLOG GENERATOR - Continuous Service
// Generates bilingual blog posts every 5 minutes automatically
// ═══════════════════════════════════════════════════════════════

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GENERATION_INTERVAL = 180000; // 3 minutes in milliseconds

if (!OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY not found in environment variables');
    console.error('Please create a .env file with: OPENAI_API_KEY=your_key_here');
    process.exit(1);
}

// Massive topic pool for infinite generation (200+ topics)
const topicPool = [
    // Gaming Platforms
    { keyword: "PlayStation Plus", category: "PlayStation", icon: "🎮", gradient: "from-blue-900/50 to-indigo-900/50" },
    { keyword: "Xbox Live Gold", category: "Xbox", icon: "🟢", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Nintendo Switch Online", category: "Nintendo", icon: "🍄", gradient: "from-red-900/50 to-white/50" },
    { keyword: "PS5 Games", category: "PlayStation", icon: "🎮", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "Xbox Game Pass", category: "Xbox", icon: "🎮", gradient: "from-green-900/50 to-lime-900/50" },
    { keyword: "Nintendo eShop Cards", category: "Nintendo", icon: "🎮", gradient: "from-red-900/50 to-pink-900/50" },

    // Battle Royale Games
    { keyword: "Fortnite V-Bucks", category: "Gaming", icon: "🔫", gradient: "from-purple-900/50 to-blue-900/50" },
    { keyword: "Apex Legends Coins", category: "Gaming", icon: "🔥", gradient: "from-red-900/50 to-orange-900/50" },
    { keyword: "PUBG UC", category: "Mobile", icon: "🎯", gradient: "from-orange-900/50 to-black/50" },
    { keyword: "Warzone CP", category: "Gaming", icon: "💣", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Fall Guys Kudos", category: "Gaming", icon: "👾", gradient: "from-pink-900/50 to-purple-900/50" },

    // MOBA & Competitive
    { keyword: "League of Legends RP", category: "Gaming", icon: "⚔️", gradient: "from-blue-900/50 to-gold-900/50" },
    { keyword: "Dota 2 Items", category: "Gaming", icon: "🗡️", gradient: "from-red-900/50 to-black/50" },
    { keyword: "Mobile Legends Diamonds", category: "Mobile", icon: "🛡️", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "Smite Gems", category: "Gaming", icon: "⚡", gradient: "from-blue-900/50 to-gold-900/50" },
    { keyword: "Heroes of the Storm Gems", category: "Gaming", icon: "⚔️", gradient: "from-blue-900/50 to-purple-900/50" },

    // Shooters
    { keyword: "Valorant Points VP", category: "Gaming", icon: "🎯", gradient: "from-red-900/50 to-black/50" },
    { keyword: "CS:GO Skins", category: "Gaming", icon: "🔫", gradient: "from-orange-900/50 to-black/50" },
    { keyword: "Rainbow Six Credits", category: "Gaming", icon: "🎯", gradient: "from-blue-900/50 to-yellow-900/50" },
    { keyword: "Overwatch 2 Coins", category: "Gaming", icon: "🦸", gradient: "from-orange-900/50 to-blue-900/50" },
    { keyword: "Call of Duty Points", category: "Gaming", icon: "💣", gradient: "from-green-900/50 to-black/50" },

    // Gacha Games
    { keyword: "Genshin Impact Primogems", category: "Gacha", icon: "💎", gradient: "from-purple-900/50 to-cyan-900/50" },
    { keyword: "Honkai Star Rail Stellar Jade", category: "Gacha", icon: "🌟", gradient: "from-purple-900/50 to-gold-900/50" },
    { keyword: "Tower of Fantasy Tanium", category: "Gacha", icon: "🗼", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "Blue Archive Pyroxene", category: "Gacha", icon: "💙", gradient: "from-blue-900/50 to-pink-900/50" },
    { keyword: "Arknights Originite Prime", category: "Gacha", icon: "🛡️", gradient: "from-blue-900/50 to-black/50" },
    { keyword: "Azur Lane Gems", category: "Gacha", icon: "⚓", gradient: "from-blue-900/50 to-red-900/50" },
    { keyword: "Fate Grand Order Saint Quartz", category: "Gacha", icon: "✨", gradient: "from-purple-900/50 to-gold-900/50" },
    { keyword: "Nikke Gold", category: "Gacha", icon: "💰", gradient: "from-red-900/50 to-gold-900/50" },
    { keyword: "Punishing Gray Raven BC", category: "Gacha", icon: "⚡", gradient: "from-gray-900/50 to-red-900/50" },
    { keyword: "Guardian Tales Gems", category: "Gacha", icon: "🗡️", gradient: "from-blue-900/50 to-orange-900/50" },

    // Mobile Games
    { keyword: "Roblox Robux", category: "Mobile", icon: "🎲", gradient: "from-red-900/50 to-gray-900/50" },
    { keyword: "Brawl Stars Gems", category: "Mobile", icon: "⭐", gradient: "from-yellow-900/50 to-orange-900/50" },
    { keyword: "Clash of Clans Gems", category: "Mobile", icon: "👑", gradient: "from-purple-900/50 to-yellow-900/50" },
    { keyword: "Clash Royale Gems", category: "Mobile", icon: "🏆", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "Free Fire Diamonds", category: "Mobile", icon: "💎", gradient: "from-red-900/50 to-purple-900/50" },
    { keyword: "Garena Free Fire Diamonds", category: "Mobile", icon: "🔥", gradient: "from-orange-900/50 to-red-900/50" },
    { keyword: "Lords Mobile Gems", category: "Mobile", icon: "🏰", gradient: "from-purple-900/50 to-blue-900/50" },
    { keyword: "Raid Shadow Legends Gems", category: "Mobile", icon: "⚔️", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "AFK Arena Diamonds", category: "Mobile", icon: "🛡️", gradient: "from-purple-900/50 to-gold-900/50" },
    { keyword: "Pokemon GO PokeCoins", category: "Mobile", icon: "🔴", gradient: "from-red-900/50 to-yellow-900/50" },
    { keyword: "Candy Crush Gold Bars", category: "Mobile", icon: "🍬", gradient: "from-pink-900/50 to-orange-900/50" },
    { keyword: "8 Ball Pool Cash", category: "Mobile", icon: "🎱", gradient: "from-blue-900/50 to-green-900/50" },
    { keyword: "Subway Surfers Coins", category: "Mobile", icon: "🚇", gradient: "from-orange-900/50 to-green-900/50" },

    // RPG & MMO
    { keyword: "World of Warcraft Gold", category: "MMO", icon: "⚔️", gradient: "from-gold-900/50 to-black/50" },
    { keyword: "Final Fantasy XIV Gil", category: "MMO", icon: "🎮", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "RuneScape Membership", category: "MMO", icon: "🗡️", gradient: "from-green-900/50 to-brown-900/50" },
    { keyword: "Elder Scrolls Online Crowns", category: "MMO", icon: "👑", gradient: "from-purple-900/50 to-gold-900/50" },
    { keyword: "Black Desert Pearls", category: "MMO", icon: "💎", gradient: "from-black/50 to-purple-900/50" },

    // Sandbox & Crafting
    { keyword: "Minecraft Minecoins", category: "Gaming", icon: "⛏️", gradient: "from-green-800/50 to-brown-900/50" },
    { keyword: "Terraria Items", category: "Gaming", icon: "🌍", gradient: "from-green-900/50 to-blue-900/50" },
    { keyword: "Roblox Premium", category: "Gaming", icon: "🎮", gradient: "from-red-900/50 to-black/50" },

    // Sports Games
    { keyword: "FIFA Points", category: "Sports", icon: "⚽", gradient: "from-green-900/50 to-white/50" },
    { keyword: "NBA 2K VC", category: "Sports", icon: "🏀", gradient: "from-orange-900/50 to-black/50" },
    { keyword: "Madden Points", category: "Sports", icon: "🏈", gradient: "from-blue-900/50 to-orange-900/50" },
    { keyword: "NHL Points", category: "Sports", icon: "🏒", gradient: "from-blue-900/50 to-red-900/50" },
    { keyword: "UFC Points", category: "Sports", icon: "🥊", gradient: "from-red-900/50 to-black/50" },

    // Racing Games
    { keyword: "Rocket League Credits", category: "Racing", icon: "🚗", gradient: "from-orange-900/50 to-blue-900/50" },
    { keyword: "Rocket League Items", category: "Racing", icon: "🏎️", gradient: "from-blue-900/50 to-orange-900/50" },
    { keyword: "Forza Horizon Credits", category: "Racing", icon: "🏁", gradient: "from-blue-900/50 to-yellow-900/50" },
    { keyword: "Gran Turismo Credits", category: "Racing", icon: "🏎️", gradient: "from-blue-900/50 to-red-900/50" },

    // Card Games
    { keyword: "Hearthstone Packs", category: "Gaming", icon: "🃏", gradient: "from-blue-900/50 to-gold-900/50" },
    { keyword: "Magic Arena Gems", category: "Gaming", icon: "🎴", gradient: "from-black/50 to-purple-900/50" },
    { keyword: "Marvel Snap Gold", category: "Gaming", icon: "🦸", gradient: "from-red-900/50 to-gold-900/50" },
    { keyword: "Yu-Gi-Oh Master Duel Gems", category: "Gaming", icon: "🎴", gradient: "from-purple-900/50 to-blue-900/50" },

    // Strategy Games
    { keyword: "War Thunder Golden Eagles", category: "Gaming", icon: "✈️", gradient: "from-green-900/50 to-yellow-900/50" },
    { keyword: "World of Tanks Gold", category: "Gaming", icon: "🚜", gradient: "from-green-900/50 to-gold-900/50" },
    { keyword: "Age of Empires Points", category: "Gaming", icon: "🏰", gradient: "from-brown-900/50 to-gold-900/50" },

    // Action/Adventure
    { keyword: "Destiny 2 Silver", category: "Gaming", icon: "🌟", gradient: "from-purple-900/50 to-white/50" },
    { keyword: "GTA Online Shark Cards", category: "Gaming", icon: "💰", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Red Dead Online Gold", category: "Gaming", icon: "🤠", gradient: "from-gold-900/50 to-brown-900/50" },
    { keyword: "Sea of Thieves Ancient Coins", category: "Gaming", icon: "🏴‍☠️", gradient: "from-blue-900/50 to-gold-900/50" },

    // Gift Cards - Retail
    { keyword: "Amazon Gift Cards", category: "Shopping", icon: "📦", gradient: "from-yellow-700/50 to-orange-900/50" },
    { keyword: "Target Gift Cards", category: "Shopping", icon: "🎯", gradient: "from-red-900/50 to-white/50" },
    { keyword: "Walmart Gift Cards", category: "Shopping", icon: "🛒", gradient: "from-blue-900/50 to-yellow-900/50" },
    { keyword: "Best Buy Gift Cards", category: "Shopping", icon: "🖥️", gradient: "from-blue-900/50 to-yellow-900/50" },
    { keyword: "eBay Gift Cards", category: "Shopping", icon: "🛍️", gradient: "from-red-900/50 to-blue-900/50" },

    // Gift Cards - Gaming
    { keyword: "Steam Gift Cards", category: "Gaming", icon: "🎮", gradient: "from-blue-900/50 to-gray-900/50" },
    { keyword: "PlayStation Store Cards", category: "PlayStation", icon: "🎮", gradient: "from-blue-900/50 to-black/50" },
    { keyword: "Xbox Gift Cards", category: "Xbox", icon: "🎮", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Nintendo eShop Gift Cards", category: "Nintendo", icon: "🎮", gradient: "from-red-900/50 to-white/50" },
    { keyword: "Epic Games Store Cards", category: "Gaming", icon: "🎮", gradient: "from-black/50 to-white/50" },

    // Gift Cards - Mobile
    { keyword: "iTunes Gift Cards", category: "Apple", icon: "🍎", gradient: "from-purple-900/50 to-pink-900/50" },
    { keyword: "Apple Gift Cards", category: "Apple", icon: "🍎", gradient: "from-gray-900/50 to-white/50" },
    { keyword: "Google Play Cards", category: "Android", icon: "🤖", gradient: "from-blue-900/50 to-green-900/50" },
    { keyword: "App Store Cards", category: "Apple", icon: "📱", gradient: "from-blue-900/50 to-purple-900/50" },

    // Streaming - Video
    { keyword: "Netflix Gift Cards", category: "Streaming", icon: "🎬", gradient: "from-red-900/50 to-black/50" },
    { keyword: "Disney Plus", category: "Streaming", icon: "🏰", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "HBO Max", category: "Streaming", icon: "🎭", gradient: "from-purple-900/50 to-black/50" },
    { keyword: "Hulu Gift Cards", category: "Streaming", icon: "📺", gradient: "from-green-900/50 to-black/50" },
    { keyword: "YouTube Premium", category: "Streaming", icon: "📺", gradient: "from-red-900/50 to-white/50" },
    { keyword: "Twitch Bits", category: "Streaming", icon: "🎮", gradient: "from-purple-900/50 to-black/50" },
    { keyword: "Prime Video", category: "Streaming", icon: "📺", gradient: "from-blue-900/50 to-black/50" },
    { keyword: "Paramount Plus", category: "Streaming", icon: "⭐", gradient: "from-blue-900/50 to-white/50" },

    // Streaming - Music
    { keyword: "Spotify Premium", category: "Music", icon: "🎵", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Apple Music", category: "Music", icon: "🎵", gradient: "from-red-900/50 to-pink-900/50" },
    { keyword: "Amazon Music", category: "Music", icon: "🎵", gradient: "from-blue-900/50 to-orange-900/50" },
    { keyword: "YouTube Music", category: "Music", icon: "🎵", gradient: "from-red-900/50 to-black/50" },
    { keyword: "Tidal Premium", category: "Music", icon: "🎵", gradient: "from-blue-900/50 to-black/50" },

    // Streaming - Anime
    { keyword: "Crunchyroll Premium", category: "Anime", icon: "🍜", gradient: "from-orange-900/50 to-black/50" },
    { keyword: "Funimation Premium", category: "Anime", icon: "🎌", gradient: "from-purple-900/50 to-orange-900/50" },
    { keyword: "VRV Premium", category: "Anime", icon: "📺", gradient: "from-orange-900/50 to-purple-900/50" },

    // Social & Communication
    { keyword: "Discord Nitro", category: "Social", icon: "💬", gradient: "from-purple-900/50 to-blue-900/50" },
    { keyword: "Telegram Premium", category: "Social", icon: "✈️", gradient: "from-blue-900/50 to-white/50" },
    { keyword: "Snapchat Plus", category: "Social", icon: "👻", gradient: "from-yellow-900/50 to-black/50" },

    // Finance & Payment
    { keyword: "PayPal Money", category: "Money", icon: "💰", gradient: "from-blue-900/50 to-cyan-900/50" },
    { keyword: "Cash App Money", category: "Money", icon: "💵", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Venmo Credits", category: "Money", icon: "💳", gradient: "from-blue-900/50 to-white/50" },
    { keyword: "Visa Gift Cards", category: "Money", icon: "💳", gradient: "from-blue-900/50 to-gold-900/50" },
    { keyword: "Mastercard Gift Cards", category: "Money", icon: "💳", gradient: "from-red-900/50 to-orange-900/50" },
    { keyword: "American Express Cards", category: "Money", icon: "💳", gradient: "from-blue-900/50 to-white/50" },

    // Food & Delivery
    { keyword: "Uber Eats Gift Cards", category: "Food", icon: "🍕", gradient: "from-green-900/50 to-black/50" },
    { keyword: "DoorDash Gift Cards", category: "Food", icon: "🥡", gradient: "from-red-900/50 to-white/50" },
    { keyword: "Grubhub Gift Cards", category: "Food", icon: "🍔", gradient: "from-orange-900/50 to-red-900/50" },
    { keyword: "Starbucks Gift Cards", category: "Food", icon: "☕", gradient: "from-green-900/50 to-white/50" },
    { keyword: "Subway Gift Cards", category: "Food", icon: "🥪", gradient: "from-green-900/50 to-yellow-900/50" },

    // Travel & Transportation
    { keyword: "Uber Gift Cards", category: "Travel", icon: "🚗", gradient: "from-black/50 to-white/50" },
    { keyword: "Lyft Gift Cards", category: "Travel", icon: "🚕", gradient: "from-pink-900/50 to-purple-900/50" },
    { keyword: "Airbnb Gift Cards", category: "Travel", icon: "🏠", gradient: "from-red-900/50 to-pink-900/50" },

    // Productivity & Software
    { keyword: "Microsoft Points", category: "Software", icon: "🪟", gradient: "from-blue-900/50 to-green-900/50" },
    { keyword: "Adobe Credits", category: "Software", icon: "🎨", gradient: "from-red-900/50 to-purple-900/50" },
    { keyword: "Canva Pro", category: "Software", icon: "🎨", gradient: "from-purple-900/50 to-cyan-900/50" },

    // Fashion & Lifestyle
    { keyword: "Nike Gift Cards", category: "Fashion", icon: "👟", gradient: "from-black/50 to-orange-900/50" },
    { keyword: "Adidas Gift Cards", category: "Fashion", icon: "👟", gradient: "from-black/50 to-white/50" },
    { keyword: "Sephora Gift Cards", category: "Beauty", icon: "💄", gradient: "from-black/50 to-white/50" },
    { keyword: "Ulta Gift Cards", category: "Beauty", icon: "💅", gradient: "from-orange-900/50 to-pink-900/50" },

    // More Mobile Games
    { keyword: "Call of Duty Mobile CP", category: "Mobile", icon: "🎯", gradient: "from-orange-900/50 to-black/50" },
    { keyword: "Among Us Stars", category: "Mobile", icon: "🚀", gradient: "from-red-900/50 to-blue-900/50" },
    { keyword: "Township Cash", category: "Mobile", icon: "🏘️", gradient: "from-green-900/50 to-orange-900/50" },
    { keyword: "Hay Day Diamonds", category: "Mobile", icon: "🌾", gradient: "from-green-900/50 to-yellow-900/50" },
    { keyword: "Coin Master Spins", category: "Mobile", icon: "🎰", gradient: "from-gold-900/50 to-purple-900/50" },
    { keyword: "Dragon City Gems", category: "Mobile", icon: "🐉", gradient: "from-red-900/50 to-purple-900/50" },
    { keyword: "State of Survival Biocaps", category: "Mobile", icon: "🧟", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Rise of Kingdoms Gems", category: "Mobile", icon: "⚔️", gradient: "from-blue-900/50 to-gold-900/50" },
    { keyword: "Empires and Puzzles Gems", category: "Mobile", icon: "💎", gradient: "from-purple-900/50 to-orange-900/50" },
    { keyword: "Merge Dragons Gems", category: "Mobile", icon: "🐲", gradient: "from-purple-900/50 to-green-900/50" },

    // More PC/Console Games
    { keyword: "Apex Legends Packs", category: "Gaming", icon: "📦", gradient: "from-orange-900/50 to-red-900/50" },
    { keyword: "Dead by Daylight Auric Cells", category: "Gaming", icon: "🔦", gradient: "from-red-900/50 to-black/50" },
    { keyword: "The Sims 4 SimPoints", category: "Gaming", icon: "🏠", gradient: "from-green-900/50 to-blue-900/50" },
    { keyword: "FIFA Ultimate Team Coins", category: "Sports", icon: "⚽", gradient: "from-green-900/50 to-gold-900/50" },
    { keyword: "Battlefield Points", category: "Gaming", icon: "💣", gradient: "from-green-900/50 to-black/50" },
    { keyword: "Star Wars Battlefront Credits", category: "Gaming", icon: "⭐", gradient: "from-black/50 to-blue-900/50" },
    { keyword: "Assassins Creed Credits", category: "Gaming", icon: "🗡️", gradient: "from-red-900/50 to-white/50" },
    { keyword: "Watch Dogs Credits", category: "Gaming", icon: "📱", gradient: "from-blue-900/50 to-black/50" },

    // Subscription Services
    { keyword: "Xbox Game Pass Ultimate", category: "Gaming", icon: "🎮", gradient: "from-green-900/50 to-gold-900/50" },
    { keyword: "PS Plus Premium", category: "PlayStation", icon: "⭐", gradient: "from-blue-900/50 to-purple-900/50" },
    { keyword: "EA Play", category: "Gaming", icon: "🎮", gradient: "from-red-900/50 to-orange-900/50" },
    { keyword: "Ubisoft Plus", category: "Gaming", icon: "🎮", gradient: "from-blue-900/50 to-white/50" },

    // Crypto & NFT
    { keyword: "Bitcoin Rewards", category: "Crypto", icon: "₿", gradient: "from-orange-900/50 to-gold-900/50" },
    { keyword: "Ethereum Rewards", category: "Crypto", icon: "Ξ", gradient: "from-purple-900/50 to-blue-900/50" },
    { keyword: "Cryptocurrency Gift Cards", category: "Crypto", icon: "💎", gradient: "from-gold-900/50 to-purple-900/50" }
];

let currentTopicIndex = 0;
let currentLanguage = 'fr'; // Alternate between fr and en
let generatedCount = 0;
let nextBlogId = 200; // Start from 200 to avoid conflicts

// HTML Template with 3-Column Ad Layout
const htmlTemplate = (lang, title, metaDesc, category, h1, date, leadIntro, content, ctaTitle, ctaText, ctaButton, isoDate, timeDisplay) => `<!DOCTYPE html>
<html lang="${lang}" class="dark">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - LootQuest</title>
    <meta name="description" content="${metaDesc}">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = { darkMode: 'class', theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'], display: ['Outfit', 'sans-serif'] }, colors: { background: '#0B0E14', surface: '#151A23', primary: '#6366f1', accent: '#10b981' } } } }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@700&display=swap" rel="stylesheet">
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
    </style>
</head>

<body class="min-h-screen flex flex-col">
<div class="page-wrapper">

    <!-- Left Ad Sidebar (Desktop Only) -->
    <aside class="ad-sidebar hidden lg:block" style="width:160px;flex-shrink:0;">
        <div class="ad-container sticky top-24">
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
        </div>
    </aside>

    <div class="main-content">
    <!-- Nav -->
    <nav class="sticky top-0 z-50 glass-panel border-b border-white/5 bg-[#0B0E14]/80">
        <div class="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/blog.html" class="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                ${lang === 'fr' ? 'Retour' : 'Back'}
            </a>
            <a href="/dashboard.html" class="text-sm font-bold text-indigo-400 hover:text-indigo-300">${lang === 'fr' ? 'Mon Compte' : 'My Account'}</a>
        </div>
    </nav>

    <!-- Article Header -->
    <header class="py-16 px-6 text-center max-w-4xl mx-auto">
        <span class="px-3 py-1 rounded bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-6 inline-block">${category}</span>
        <h1 class="font-display font-bold text-4xl md:text-5xl text-white mb-6 leading-tight">${h1}</h1>
        <div class="flex items-center justify-center gap-4 text-sm text-gray-500">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xs">LQ</div>
                <span>${lang === 'fr' ? 'Équipe LootQuest' : 'LootQuest Team'}</span>
            </div>
            <span>•</span>
            <time datetime="${isoDate}">${date} • ${timeDisplay}</time>
        </div>
    </header>

    <!-- Content -->
    <main class="flex-1 px-6 pb-20">
        <article class="prose glass-panel p-8 md:p-12 rounded-3xl">

            <p class="lead text-xl text-gray-300 mb-8 border-l-4 border-indigo-500 pl-4 italic">
                ${leadIntro}
            </p>

${content}

            <!-- HORIZONTAL AD BANNER (320x50) -->
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
            </div>

            <div class="bg-indigo-600/20 border border-indigo-500 rounded-2xl p-8 text-center mt-12">
                <h3 class="!mt-0 !text-indigo-300">${ctaTitle}</h3>
                <p class="text-white">${ctaText}</p>
                <a href="/dashboard.html" class="inline-block mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl no-underline transition-transform hover:scale-105">
                    ${ctaButton} →
                </a>
            </div>
        </article>
    </main>
    </div>

    <!-- Right Ad Sidebar (Desktop Only) -->
    <aside class="ad-sidebar hidden lg:block" style="width:160px;flex-shrink:0;">
        <div class="ad-container sticky top-24">
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
        </div>
    </aside>

</div>

    <footer class="text-center py-8 text-gray-600 text-sm">
        <p>&copy; 2025 LootQuest.</p>
    </footer>

    <!-- Auth Modal -->
    <div id="auth-modal" class="fixed inset-0 z-50 hidden">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="closeAuthModal()"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md p-6">
            <div class="bg-[#151A23] border border-white/10 rounded-2xl p-8 relative">
                <button onclick="closeAuthModal()" class="absolute top-4 right-4 text-gray-500 hover:text-white text-2xl">&times;</button>
                <h2 class="text-2xl font-bold text-white text-center mb-2">${lang === 'fr' ? 'Connexion' : 'Log In'}</h2>
                <p class="text-gray-400 text-center mb-6">${lang === 'fr' ? 'Connectez-vous pour commencer à gagner' : 'Sign in to start earning'}</p>
                
                <div class="space-y-4">
                    <a href="/?auth=google" class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-100 text-gray-700 font-bold rounded-xl transition-all hover:scale-[1.02] no-underline">
                        <svg class="w-6 h-6" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span>${lang === 'fr' ? 'Continuer avec Google' : 'Continue with Google'}</span>
                    </a>
                    
                    <a href="/api/auth/discord" class="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all hover:scale-[1.02] no-underline">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                        </svg>
                        <span>${lang === 'fr' ? 'Continuer avec Discord' : 'Continue with Discord'}</span>
                    </a>
                </div>
                
                <p class="text-center text-xs text-gray-500 mt-6">
                    ${lang === 'fr' ? 'En vous connectant, vous acceptez nos' : 'By logging in, you agree to our'} 
                    <a href="/terms" class="text-indigo-400 hover:underline">${lang === 'fr' ? 'Conditions' : 'Terms'}</a>
                </p>
            </div>
        </div>
    </div>

    <script>
        function openAuthModal() {
            document.getElementById('auth-modal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
        
        function closeAuthModal() {
            document.getElementById('auth-modal').classList.add('hidden');
            document.body.style.overflow = '';
        }
        
        // Check if user is logged in when clicking CTA
        async function handleCTA(event) {
            event.preventDefault();
            try {
                const res = await fetch('/api/user/me', { credentials: 'include' });
                if (res.ok) {
                    window.location.href = '/dashboard.html';
                } else {
                    openAuthModal();
                }
            } catch (e) {
                openAuthModal();
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('a[href="/dashboard.html"]').forEach(btn => {
                btn.addEventListener('click', handleCTA);
            });
        });
        
        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAuthModal();
        });
    </script>
</body>

</html>`;


function slugify(text) {
    return text.toLowerCase()
        .replace(/[àáâãäå]/g, 'a')
        .replace(/[èéêë]/g, 'e')
        .replace(/[òóôõö]/g, 'o')
        .replace(/[ùúûü]/g, 'u')
        .replace(/[ç]/g, 'c')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

async function callGPT(prompt, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-5-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'Tu es un expert en gaming, rewards et GPT. Rédige des articles SEO optimisés, engageants et factuels.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_completion_tokens: 2500
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`GPT API error: ${response.status} - ${errorBody.substring(0, 200)}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            console.error(`   ⚠️  Attempt ${attempt}/${retries} failed: ${error.message}`);

            if (attempt < retries) {
                const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
                console.log(`   ⏳ Retrying in ${waitTime / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                throw error; // Re-throw on final attempt
            }
        }
    }
}

async function generateBlogContent(keyword, lang) {
    const langName = lang === 'fr' ? 'French' : 'English';
    const prompt = `You are a Gen Z gaming blogger writing for LootQuest, a legitimate rewards platform where gamers earn gift cards by completing offers.

Write a blog post in ${langName} about "${keyword}" - specifically how to get them for FREE using LootQuest.

IMPORTANT: Respond ONLY with a valid JSON object (no markdown, no code blocks). Use this exact structure:
{
    "title": "SEO title (60 chars max)",
    "metaDescription": "Meta description (155 chars max)",
    "h1": "Catchy H1 headline without emoji",
    "leadIntro": "A short italic intro paragraph (1-2 sentences) that hooks the reader.",
    "content": "The main article content with proper HTML formatting. Use \\n for newlines between paragraphs.",
    "ctaTitle": "${lang === 'fr' ? 'Arrêtez de chercher des hacks' : 'Stop Searching for Hacks'}",
    "ctaText": "${lang === 'fr' ? 'Gagnez vos récompenses honnêtement et rapidement.' : 'Earn your rewards honestly and quickly.'}",
    "ctaButton": "${lang === 'fr' ? 'COMMENCER MAINTENANT' : 'START EARNING NOW'}"
}

CONTENT FORMATTING RULES:
- Write 400-600 words
- Format with proper HTML: <p>, <h2>, <ul>, <li>, <strong>
- Include 2-3 <h2> sections
- Include at least one <ul> list with steps
- Use <strong> for important terms like "LootQuest"
- Be energetic but professional
- Warn against scam generators
- Explain the LootQuest method clearly
- The JSON must be valid and parseable`;

    const response = await callGPT(prompt);

    let jsonStr = response.trim();
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    return JSON.parse(jsonStr);
}

async function generateSingleBlog() {
    const topic = topicPool[currentTopicIndex % topicPool.length];

    console.log(`\n🔄 [${new Date().toLocaleTimeString()}] Generating FR + EN: ${topic.keyword}...`);

    try {
        // Generate both FR and EN in parallel
        const [contentFR, contentEN] = await Promise.all([
            generateBlogContent(topic.keyword, 'fr'),
            generateBlogContent(topic.keyword, 'en')
        ]);

        // Process both languages
        for (const { content, lang } of [{ content: contentFR, lang: 'fr' }, { content: contentEN, lang: 'en' }]) {
            // Generate timestamps
            const now = new Date();
            const isoDate = now.toISOString();

            // Time display (HH:MM)
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const timeDisplay = `${hours}:${minutes}`;

            // Date formatting
            const date = lang === 'fr'
                ? now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
                : now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            const slug = slugify(content.title) + `-${lang}`;

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
                content.ctaButton,
                isoDate,
                timeDisplay
            );

            const filePath = path.join(__dirname, 'public', 'blog', `${slug}.html`);
            fs.writeFileSync(filePath, html);
            console.log(`   ✅ Created: ${slug}.html`);

            // Update blog-data.js
            const blogEntry = {
                id: nextBlogId++,
                title: content.title,
                excerpt: content.metaDescription,
                category: topic.category,
                readTime: lang === 'fr' ? '5 min' : '5 min',
                date,
                timestamp: isoDate,
                image: null,
                gradient: topic.gradient,
                icon: topic.icon,
                slug,
                lang
            };

            updateBlogData(blogEntry);
        }

        generatedCount += 2; // 2 blogs (FR + EN)
        console.log(`   📊 Total generated: ${generatedCount}`);

        // Move to next topic
        currentTopicIndex++;

    } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
    }
}

function updateBlogData(entry) {
    const blogDataPath = path.join(__dirname, 'public', 'js', 'blog-data.js');
    let content = fs.readFileSync(blogDataPath, 'utf8');

    // Find the FIRST ]; which closes the blogPosts array
    // NOT the last one which closes categories
    const blogPostsArrayEnd = content.indexOf('];\n\nexport const categories');

    if (blogPostsArrayEnd === -1) {
        console.error('   ❌ Could not find blogPosts array end marker');
        return;
    }

    const newEntry = `,
    {
        id: ${entry.id},
        title: "${entry.title.replace(/"/g, '\\"')}",
        excerpt: "${entry.excerpt.replace(/"/g, '\\"')}",
        category: "${entry.category}",
        readTime: "${entry.readTime}",
        date: "${entry.date}",
        timestamp: "${entry.timestamp}",
        image: null,
        gradient: "${entry.gradient}",
        icon: "${entry.icon}",
        lang: "${entry.lang}"
    }`;

    // Insert BEFORE the first ];
    content = content.slice(0, blogPostsArrayEnd) + newEntry + '\n' + content.slice(blogPostsArrayEnd);
    fs.writeFileSync(blogDataPath, content);
    console.log(`   📝 Updated blog-data.js (ID: ${entry.id})`);
}

async function startAutoGeneration() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🤖 LOOTQUEST AUTO-BLOG GENERATOR STARTED');
    console.log('═══════════════════════════════════════════════════');
    console.log(`⏱️  Generation interval: ${GENERATION_INTERVAL / 1000}s`);
    console.log(`📚 Topic pool size: ${topicPool.length} topics`);
    console.log(`🌍 Languages: FR ↔ EN (alternating)`);
    console.log('═══════════════════════════════════════════════════\n');

    // Generate first blog immediately
    await generateSingleBlog();

    // Then generate every minute
    setInterval(async () => {
        await generateSingleBlog();
    }, GENERATION_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down auto-generator...');
    console.log(`📊 Total blogs generated: ${generatedCount}`);
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down auto-generator...');
    console.log(`📊 Total blogs generated: ${generatedCount}`);
    process.exit(0);
});

// Start the service
startAutoGeneration();
