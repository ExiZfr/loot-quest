$VPS_HOST = "82.165.138.12"
$VPS_USER = "root"
$VPS_PASSWORD = "7GYMO97a"

Write-Host "Connexion au VPS pour déploiement..." -ForegroundColor Cyan

# Utiliser ssh avec expect-like behavior via PowerShell
$commands = @(
    "cd /var/www/lootquest",
    "git pull origin master",
    "pm2 restart lootquest"
)

# Créer un script expect temporaire
$expectScript = @"
spawn ssh $VPS_USER@$VPS_HOST
expect "password:"
send "$VPS_PASSWORD\r"
expect "$ "
send "cd /var/www/lootquest\r"
expect "$ "
send "git pull origin master\r"
expect "$ "
send "pm2 restart lootquest\r"
expect "$ "
send "exit\r"
expect eof
"@

# Alternative: utiliser sshpass si disponible, sinon afficher les instructions
try {
    # Essayer avec ssh et auto-accept host key
    $env:SSHPASS = $VPS_PASSWORD
    
    Write-Host "`nTentative de connexion SSH..." -ForegroundColor Yellow
    
    # Commande SSH combinée
    $sshCommand = "cd /var/www/lootquest && git pull origin master && pm2 restart lootquest"
    
    # Malheureusement PowerShell ne peut pas passer le mot de passe automatiquement
    Write-Host "`n⚠️  SSH nécessite une interaction manuelle sur Windows" -ForegroundColor Red
    Write-Host "`nVeuillez executer ces commandes manuellement :" -ForegroundColor Yellow
    Write-Host "1. Ouvrez PuTTY ou un client SSH" -ForegroundColor White
    Write-Host "2. Connectez-vous à : $VPS_USER@$VPS_HOST" -ForegroundColor White
    Write-Host "3. Mot de passe : $VPS_PASSWORD" -ForegroundColor White
    Write-Host "4. Executez :" -ForegroundColor White
    Write-Host "   cd /var/www/lootquest" -ForegroundColor Green
    Write-Host "   git pull origin master" -ForegroundColor Green
    Write-Host "   pm2 restart lootquest" -ForegroundColor Green
    
} catch {
    Write-Host "Erreur: $_" -ForegroundColor Red
}
