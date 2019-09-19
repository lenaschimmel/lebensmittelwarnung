fs = require('fs');
path = require('path');
Twit = require('twit');
var multer  = require('multer');

config = require(path.join(__dirname, 'config.js'));

var upload = multer({ storage: multer.memoryStorage() })
var T = new Twit(config);

function upload_image(image_path, text) {
    console.log('Opening an image...');
    var b64content = fs.readFileSync(image_path, { encoding: 'base64' });

    console.log('Uploading an image...');

    T.post('media/upload', { media_data: b64content }, function (err, data, response) {
        if (err){
        console.log('ERROR:');
        console.log(err);
        }
        else{
        console.log('Image uploaded!');
        console.log('Now tweeting it...');

        T.post('statuses/update', {
            status: text,
            media_ids: new Array(data.media_id_string)
        },
            function(err, data, response) {
            if (err){
                console.log('ERROR:');
                console.log(err);
            }
            else{
                console.log('Posted an image!');
            }
            }
        );
        }
    });
}

var text = "Die Twitter-Schnittstelle wird gerade getestet.";
upload_image("logo.png", text);

console.log("Running.");