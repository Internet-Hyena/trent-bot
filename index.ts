import { BskyAgent } from '@atproto/api';
import * as dotenv from 'dotenv';
import { CronJob } from 'cron';
import * as process from 'process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { unescape } from 'node:querystring';

dotenv.config();

// Create a Bluesky Agent 
const agent = new BskyAgent({
    service: 'https://bsky.social',
})


async function main() {
    // get a random file from the list
    let basename: string;
    let imageBlob: Blob;
    do {
        const fileUrls = fs
            .readFileSync(process.env.IMAGE_LIST_NAME!)
            .toString('utf8')
            .split('\n');
        const fileUrl = fileUrls[fileUrls.length * Math.random() | 0];
        basename = fileUrl.slice(fileUrl.lastIndexOf('/') + 1);
        basename = unescape(basename);

        console.log(`Fetching file... ${fileUrl}`);
        imageBlob = await (await fetch(fileUrl)).blob();
        console.log(`Got ${basename} (size=${imageBlob.size},type=${imageBlob.type})`);
    } while (!imageBlob.type.startsWith("image/") || imageBlob.size > 976000)

    console.log(`Logging in as ${process.env.BLUESKY_USERNAME!}...`);
    await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! })

    console.log(`Uploading image as blob...`);
    const uploadBlobRespose = await agent.uploadBlob(await imageBlob.bytes(), {
        "encoding": "",
        "headers": {
            "Content-Type": imageBlob.type
        }
    });
    const blobRef = uploadBlobRespose.data.blob;
    console.log(`Successfully uploaded blob (ref=${blobRef.toJSON()})`);

    const postText = "File:" + basename.replaceAll("_", " ");

    const postResponse = await agent.post({
        text: postText,
        embed: {
            $type: "app.bsky.embed.images",
            images: [{
                alt: path.basename(basename),
                image: blobRef
            }]
        }
    });

    console.log(`Just posted! ${postResponse.cid}`);
}

main();