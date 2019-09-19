const fs = require('fs');
const path = require('path');
const Twit = require('twit');
const util = require('util');
const multer  = require('multer');

config = require(path.join(__dirname, 'config.js'));
const readFile = util.promisify(fs.readFile);

var upload = multer({ storage: multer.memoryStorage() })
var T = new Twit(config);

async function upload_image(imagePath, altText) {
    console.log('Opening an image...');
    var b64content = await readFile(imagePath, { encoding: 'base64' });

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


(async () => {
    var text = "Die Twitter-Schnittstelle wird gerade doppelt asynchron mit alt_text getestet.";
    var mediaId = await upload_image("logo.png", "Das Logo von produkt_warnung.");
    var result = await post_tweet(text, new Array(mediaId));
    
    console.log("Running.");
})();