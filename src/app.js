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
const speedDate = require('speed-date');
const markdownpdf = require("markdown-pdf");
const PDFImage = require("pdf-image").PDFImage;
const pdf2text = require('pdf2text')

config = require(path.join(__dirname, 'config.js'));
const readFile = util.promisify(fs.readFile);

var upload = multer({ storage: multer.memoryStorage() })
var T = new Twit(config);

process.on('unhandledRejection', error => {
    console.log(error);
    process.exit(1);
});

async function upload_image(imageContent, altText) {
    //console.log('Opening an image...');
    var b64content = btoa(imageContent);
    // await readFile(imagePath, { encoding: 'base64' });

    console.log('Uploading an image...');
    console.log('Alt text: ' + altText);

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
    console.log('Content: ' + text);
    

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
    "Haltbarkeit:" : "bestbefore",
    "Produktionsdatum:" : "proddate",
    "Los-Kennzeichnung:" : "los",
    "Homepage des Herstellers:" : "homepage",
    "Weitere Informationen:" : "info"
};


async function parseListPage(sourceUrl) {
    var content = await request(sourceUrl);
    const $ = cheerio.load(content);

    var detail_pages = new Set();
    $("a.contentLink").each(function(i, elem) {
        var href = $(this).attr("href");
        if(href.substr(0,1) == "/") {
            href = "https://www.lebensmittelwarnung.de" + href;
        }
        detail_pages.add(href);
    });

    return Array.from(detail_pages);
}

async function parseDetailPage(sourceUrl) {
    var content = await request(sourceUrl);
    const $ = cheerio.load(content);

    var images = new Set();
    $(".attachment-group a").each(function(i, elem) {
        var href = $(this).attr("href");
        if(href.substr(0,1) == "/") {
            href = "https://www.lebensmittelwarnung.de" + href;
        }
        images.add(href);
    });

    if (images.size == 0 ) {
        // If there are no links to larger images, use the small images which are embedded
        $(".attachment-group img").each(function(i, elem) {
            var href = $(this).attr("src");
            if(href.substr(0,1) == "/") {
                href = "https://www.lebensmittelwarnung.de" + href;
            }
            images.add(href);
        });
    }

    var attachments = new Set();
    $("a.attachment").each(function(i, elem) {
        var href = $(this).attr("href");
        if(href.substr(0,1) == "/") {
            href = "https://www.lebensmittelwarnung.de" + href;
        }
        attachments.add(href);
    });

    var map = {};
    $(".form-group").each(function(i, elem) {
        var key = $("label", this).text();
        var simpleKey = knownKeys[key];
        var value = $(".form-control-static", this).text().trim();
        if(simpleKey && value.length > 0) {
            map[simpleKey] = value;
        }
    });

    map["images"] = Array.from(images);
    map["attachments"] = Array.from(attachments);
    map["sourceUrl"] = sourceUrl;

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

function simpleProducerName(nameString) {
    var useNext = false;
    var acceptableMatch;

    // Split along newlines and commas
    for(var part of nameString.split(/[\r\n,]+/)) {
        
        part = part.trim();

        // rule out empty and very short parts
        if(part.length < 3) continue;
        
        // if the previous line was something like "Hersteller", this line must be the best one to use
        if(useNext) {
            acceptableMatch = part;
            break;
        }

        // reset the flag
        useNext = false;

        // A "Hersteller" line indicates that the next line should be used
        if(part == "Hersteller" || part == "Hersteller:") {
            useNext = true;
            continue;
        }  

        // A "Großhändler" line shall never be used itself, but the next line will be treated normally
        if(part == "Großhändler" || part == "Großhändler:")  {
            continue;
        }

        // Remember the first line that has not been ruled out
        if(!acceptableMatch)
            acceptableMatch = part;
    }

    return acceptableMatch || nameString;
}

function limitLength(maxLength, string) {
    if(string.length > maxLength) {
        string = string.substr(0, maxLength - 2) + "…"; // substract 2, because the ellipse counts as two chars on twitter
    }
    return string;
}

function composeTweetText(page) {
    var simplifiedName = page.name.replace(/\s+/g, " ");
    var producer = simpleProducerName(page.producer);

    var lines = [];
    // Lenght: 9 + content (max 20 + 30 + 25) = 84
    lines.push(limitLength(20, page.type) + ' "' + limitLength(30, simplifiedName) + '" von ' + limitLength(25, producer) + ':');
    
    // Length: 130
    lines.push(limitLength(130, page.reason));

    // Length: 11 + 20 = 31
    lines.push('Mehr Info: ' + page.sourceUrl);

    // Length:22
    if(page.date != speedDate("DD.MM.YYYY", new Date()))
        lines.push('(Eintrag vom ' + page.date + ')');

    // Total length: 84 + 130 + 31 + 22 + 3*2 = 273
    return lines.join("\n\n");
}

async function createFullInfoImage(page) {

    return new Promise(function(resolve, reject) { 
        
        // Portal www.lebensmittelwarnung.de [Jahresangabe]: [Dokumenttitel], [URL], Stand: [Datum]
        var citation = 'Portal www.lebensmittelwarnung.de ' + speedDate("YYYY", new Date()) + ': Warnungsdetails, ' + page.sourceUrl +', Stand: ' + speedDate("DD.MM.YYYY", new Date());
        var note = 'Diese Informationen sind über das Portal „lebensmittelwarnung.de“ der Länder und des Bundesamtes für Verbraucherschutz und Lebensmittelsicherheit kostenfrei abrufbar.';

        md = [ '# **Produktwarnung**' ];

        altText = [ "Vollständige Information: " ];

        for(const longKey in knownKeys) {
            var shortKey = knownKeys[longKey];
            if(page[shortKey] && page[shortKey].trim().length > 3) {
                md.push('## ' + longKey);
                md.push(page[shortKey]);

                altText.push(longKey + ": " + page[shortKey]);
            } 
        }

        md.push('***');
        md.push('# Quelle');
                
        md.push("_" + citation + "_");
        md.push("_" + note + "_");
        md.push('<span style="font-size: 70%">Manchmal müssen die Informationen gekürzt werden, um in das Zeichenlimit eines Tweets zu passen. Diese Seite mit ungekürzten Infos wurde angehangen, um der rechtlichen Anforderung nachzukommen, die Informationen stets vollständig weiter zu geben.</span>');
        
        altText.push(citation);
        altText.push(note);

        var altTextString = altText.join("\n");
        if(altTextString.length > 419) {
            altTextString = "Das Bild enthält die vollständigen, ungekürzten Informationen der Meldung, die leider zu lang sind für eine Bildbeschreibung auf Twitter. " + citation;
        }

        const pdfPath = "tmp/img/pdf/markdown.pdf";

        markdownpdf( { "remarkable" : { "html" : true }, "cssPath" : "data/pdf.css" } ).from.string(md.join("\n\n")).to(pdfPath, async function() {
            console.log("Done PDF");
            
            try {
                var pdfImage = new PDFImage(pdfPath, {
                    convertOptions: {
                        "-alpha" : "Opaque",
                        "-background": "white",
                        "-density" : "300"
                    }
                });
                var imagePath = await pdfImage.convertPage(0);
                console.log("Output: " + imagePath);
                var imageData = fs.readFileSync(imagePath);
                var mediaId = await upload_image(imageData, altTextString);
                resolve(mediaId);
            } catch (e) {
                console.log("Error: " + util.inspect(e));
                reject(e);
            }
        });
     });
}

async function handlePage(sourceUrl) {
    
    console.log("Parsing source page…");
    var page = await parseDetailPage(sourceUrl);
    console.log(page);

    
    console.log("Downloading and uploading images…");
    var mediaIds = [];
    var image_index = 1;
    var attachment_index = 1;
    var media_index = 1;

    for(var attachmentUrl of page.attachments) {
        console.log("Downloading attachment " + attachmentUrl);
        var content = await downloadUrl(attachmentUrl);
        var pdfPath = "tmp/img/download/pdf" + attachment_index + ".pdf";
        fs.writeFileSync(pdfPath, content);

        var pdfImage = new PDFImage(pdfPath, {
            convertOptions: {
                "-alpha" : "Opaque",
                "-background": "white",
                "-density" : "300"
            }
        });

        var altTextString = "Presseinformation " + attachment_index + " von " + page.attachments.length + ". Bei mehrseitigen PDF-Anhängen wird nur die jeweils erste Seite als Bild angehangen. Inhalt der PDF: ";

        var pages = await pdf2text(content);

        for (const page of pages) {
            console.log("Page content: " + page);
            altTextString = altTextString + page.join('');
        }
    
        altTextString = limitLength(1000, altTextString);
        
        var imagePath = await pdfImage.convertPage(0);
        console.log("Converted pdf attachment: " + imagePath);
        var imageData = fs.readFileSync(imagePath);
       
        var mediaId = await upload_image(imageData, altTextString);
        mediaIds.push(mediaId);
        attachment_index ++;
        media_index ++;
        if(media_index > 3)
            break; // we need the 4th image for the full information page
    }

    if(media_index <= 3) {
        for(var imgUrl of page.images) {
            console.log("Downloading image " + imgUrl);
            var content = await downloadUrl(imgUrl);
            fs.writeFileSync("tmp/img/download/image" + image_index + ".jpg", content);

            var mediaId = await upload_image(content, "Produktabbildung " + image_index + " von " + page.images.length);
            mediaIds.push(mediaId);
            image_index ++;
            media_index ++;
            if(media_index > 3)
                break; // we need the 4th image for the full information page
        }
    }
    mediaIds.push(await createFullInfoImage(page));

    console.log("Composing tweet…");

    text = composeTweetText(page);

    var result = await post_tweet(text, mediaIds);
}

(async () => {
    var files_done = [];
    try {
        let rawdata = fs.readFileSync('tmp/files_done.json') || "[]";
        files_done = JSON.parse(rawdata);
    } catch {
        // nothing
    }

    const listUrl = "https://www.lebensmittelwarnung.de/bvl-lmw-de/liste/alle/deutschlandweit/10/0";
    
    let detailUrls = await parseListPage(listUrl);
    detailUrls.reverse();

    for (const detailUrl of detailUrls) {
        if (!files_done.includes(detailUrl)) {
            console.log("Now handling detail page: " + detailUrl);
            files_done.push(detailUrl);
            await handlePage(detailUrl);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    let data = JSON.stringify(files_done, null, 2);
    fs.writeFileSync('tmp/files_done.json', data);

    console.log("Done.");
})();