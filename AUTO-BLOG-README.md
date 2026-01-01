# 🤖 Auto-Blog Generator - Instructions de déploiement

## 📋 Ce que ça fait

Le script `auto-blog-generator.js` génère automatiquement **1 nouveau blog par minute** :
- Alterne entre français et anglais
- **151 sujets** gaming, streaming, finance, crypto dans la rotation
- Template identique aux blogs existants
- Met à jour `blog-data.js` automatiquement
- Sauvegarde dans `public/blog/`


## 🚀 Déploiement sur le VPS

### Étape 1 : Push sur GitHub
```bash
git add .
git commit -m "Expanded auto-blog generator to 200+ topics"
git push origin master
```

### Étape 2 : Connexion au VPS
```bash
ssh root@82.165.138.12
# Mot de passe : 7GYMO97a
```

### Étape 3 : Mise à jour et démarrage
```bash
cd /var/www/lootquest
git pull origin master
pm2 reload ecosystem.config.js
pm2 save
```

### Étape 4 : Vérifier que ça tourne
```bash
pm2 logs auto-blog-generator
```

Tu devrais voir :
```
🤖 LOOTQUEST AUTO-BLOG GENERATOR STARTED
⏱️  Generation interval: 60s
📚 Topic pool size: 151 topics
🌍 Languages: FR ↔ EN (alternating)

🔄 [21:25:00] Generating FR: PlayStation Plus...
   ✅ Created: playstation-plus-gratuit-fr.html
   📝 Updated blog-data.js (ID: 200)
   📊 Total generated: 1
```

## 🛑 Arrêter le générateur
```bash
pm2 stop auto-blog-generator
```

## 🔄 Redémarrer
```bash
pm2 restart auto-blog-generator
```

## 📊 Voir les stats
```bash
pm2 status
pm2 monit
```

## 🎯 Résultat

- **1 blog/minute** = 60 blogs/heure = **1440 blogs/jour**
- **151 topics** × 2 langues = **302 blogs uniques** avant rotation
- Rotation infinie après avoir épuisé tous les sujets
- FR/EN pour chaque sujet
- Logs dans `/var/www/lootquest/logs/`

🚀 **Le site aura 302 blogs uniques en moins de 6 heures !**


