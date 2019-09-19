const fs = require('fs');
const path = require('path');
const Twit = require('twit');
const util = require('util');
const multer  = require('multer');

config = require(path.join(__dirname, 'config.js'));
const readFile = util.promisify(fs.readFile);

var upload = multer({ storage: multer.memoryStorage() })
var T = new Twit(config);

async function upload_image(image_path, alt_text) {
    console.log('Opening an image...');
    var b64content = await readFile(image_path, { encoding: 'base64' });

    console.log('Uploading an image...');

    return new Promise(function(resolve, reject) { 
        T.post('media/upload', { media_data: b64content }, function (err, data, response) {
            if(err)
                reject(err);
            else 
                resolve(data);
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
    var text = "Die Twitter-Schnittstelle wird gerade doppelt asynchron getestet.";
    var media = await upload_image("logo.png", "Das Logo von produkt_warnung.");
    var result = await post_tweet(text, new Array(media.media_id_string));
    
    console.log("Running.");
})();