set -e
cd /usr/src/app
mkdir -p tmp/img/download
mkdir -p tmp/img/infopage
mkdir -p tmp/img/pdf
node src/app.js > /var/log/cron.log
