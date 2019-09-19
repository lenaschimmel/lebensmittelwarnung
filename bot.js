const fs = require('fs');
const path = require('path');
const Twit = require('twit');
const util = require('util');
const multer  = require('multer');
const request = require('request-promise');
const cheerio = require('cheerio');
const btoa = require('btoa');
const https = require('https');
const streamBuffers = require('stream-buffers');

config = require(path.join(__dirname, 'config.js'));
const readFile = util.promisify(fs.readFile);

var upload = multer({ storage: multer.memoryStorage() })
var T = new Twit(config);

async function upload_image(imageContent, altText) {
    //console.log('Opening an image...');
    var b64content = btoa(imageContent);
    // await readFile(imagePath, { encoding: 'base64' });

    console.log('Uploading an image...');

    return new Promise(function(resolve, reject) { 
        T.post('media/upload', { media_data: b64content }, function (err, data, response) {
            if(err)
                reject(err);
            else {
                // now we can assign alt text to the media, for use by screen readers and
                // other text-based presentations and interpreters
                var mediaIdStr = data.media_id_string;
                var meta_params = { media_id: mediaIdStr, alt_text: { text: altText } };

                T.post('media/metadata/create', meta_params, function (err, data, response) {
                    if(err)
                        reject(err);
                    else 
                        resolve(mediaIdStr);
                });
            }
        });
     });
}

async function post_tweet(text, mediaArray) {
    console.log('Sending a tweet...');

    return new Promise(function(resolve, reject) { 
        T.post('statuses/update', {
            status: text,
            media_ids: mediaArray
        },
        function (err, data, response) {
            if(err)
                reject(err);
            else 
                resolve(data);
        });
     });
}

const knownKeys = {
    "Warnungstyp:" : "type",
    "Datum der ersten Veröffentlichung:" : "date",
    "Produktbezeichnung:" : "name",
    "Hersteller (Inverkehrbringer):" : "producer",
    "Grund der Warnung:" : "reason",
    "Verpackungseinheit:" : "size",
    "Haltbarkeit" : "bestbefore",
    "Weitere Informationen:" : "info"
};

async function parseDetailPage(sourceUrl) {
    var content = await request(sourceUrl);
    const $ = cheerio.load(content);

    var images = new Set();
    $(".attachment-group a").each(function(i, elem) {
        var href = $(this).attr("href");
        if(href.substr(0,1) == "/") {
            href = "https://www.lebensmittelwarnung.de/" + href;
        }
        images.add(href);
    });

    var map = {};
    $(".form-group").each(function(i, elem) {
        var key = $("label", this).text();
        var simpleKey = knownKeys[key];
        var value = $("span", this).text().trim();
        if(simpleKey && value.length > 0) {
            map[simpleKey] = value;
        }
    });

    map["images"] = Array.from(images);

    return map;
}

async function downloadUrl(url) {
    return new Promise(function(resolve, reject) { 
        let dest = new streamBuffers.WritableStreamBuffer();

        const request = https.get(url, function(response) {
            response.pipe(dest);
        });

        dest.on('finish', () => {
            let data = dest.getContents();
            resolve(data);
        });
        dest.on('error', (err) => {
            reject(err);
        });
     });    
}

(async () => {
    console.log("Parsing source page…");
    const sourceUrl = "https://www.lebensmittelwarnung.de/bvl-lmw-de/detail/lebensmittel/45259";
    var page = await parseDetailPage(sourceUrl);
    console.log(page);

    console.log("Downloading and uploading images…");
    var mediaIds = [];
    var index = 1;
    for(var imgUrl of page.images) {
        var content = await downloadUrl(imgUrl);
        fs.writeFileSync("img/download/image" + index + ".jpg", content);
        var mediaId = await upload_image(content, "Produktabbildung " + index + " von " + page.images.length);
        mediaIds.push(mediaId);
        index ++;
    }

    console.log("Sending tweet…");
    var simplifiedName = page.name.replace(/\s+/g, " ");
    var lines = [];
    lines.push('Warnung vom ' + page.date +  ' für ' + page.type + ' "' + simplifiedName + '":');
    lines.push(page.reason);
    lines.push('Mehr Informationen unter ' + sourceUrl);
    var text = lines.join("\n\n");
    var result = await post_tweet(text, mediaIds);

    console.log("Done.");
    
})();