set -e

export OPENSSL_CONF=/etc/ssl/

imagemagic_config=/etc/ImageMagick-6/policy.xml
echo "Old policy:"
grep PDF $imagemagic_config
echo "Patching policy.xml"
if [[ -f $imagemagic_config ]] ; then sed -i 's/<policy domain="coder" rights="none" pattern="PDF" \/>/<policy domain="coder" rights="read|write" pattern="PDF" \/>/g' $imagemagic_config ; else echo did not see file $imagemagic_config ; fi
echo "New policy:"
grep PDF $imagemagic_config

cd /usr/src/app
mkdir -p tmp/img/download
mkdir -p tmp/img/infopage
mkdir -p tmp/img/pdf
/usr/local/bin/node --async-stack-traces src/app.js >> /var/log/cron.log 2>&1
curl https://hc-ping.com/b4838446-edaa-4099-b8ed-fa3b143753d6
