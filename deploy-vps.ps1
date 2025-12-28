$password = ConvertTo-SecureString "7GYMO97a" -AsPlainText -Force
$commands = @"
cd /var/www/lootquest
git remote set-url origin https://github.com/ExiZfr/loot-quest.git
git pull origin master
pm2 restart lootquest
"@

Write-Host "🚀 Connecting to VPS and deploying changes..."
echo $commands | ssh root@82.165.138.12
