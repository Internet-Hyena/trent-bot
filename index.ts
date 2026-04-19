import { BskyAgent } from '@atproto/api';
import { BlobRef } from '@atproto/lexicon';
import { RichText } from '@atproto/api'
import * as dotenv from 'dotenv';
import * as process from 'process';
import * as fs from 'node:fs';

dotenv.config();

type Image = {
    id: string,
    title: string,
    date: string,
    homepageUrl: string,
    downloadUrl: string
};

function getMediaList(path): Image[] {
    const json = fs
        .readFileSync(path)
        .toString('utf8');
    const media = JSON.parse(json);
    return media;
}

function getRandom<T>(arr: T[]): T {
    return arr[arr.length * Math.random() | 0];
}

async function getImageDataBlob(fileUrl: string) {
    console.log(`Fetching URL: ${fileUrl}`);
    const imageBlob = await (await fetch(fileUrl)).blob();
    console.log(`Size: ${imageBlob.size}`)
    console.log(`MIME type: ${imageBlob.type})`);
    return imageBlob;
}

async function main() {
    const mediaJsonPath = "./media.json";

    console.log(`Reading media list from ${mediaJsonPath}...`);
    const images = getMediaList(mediaJsonPath);
    console.log(`Got ${images.length} images.`);

    let image: Image;
    let imageBlob: Blob;
    let validImage = false;
    let attempts = 0;
    do {
        if (attempts > 10) {
            throw new Error("Too many tries to get a valid image.");
        }
        image = getRandom(images);
        console.log(`Randomly chosen image: `, image);

        console.log(`Downloading image data...`);
        imageBlob = await getImageDataBlob(image.downloadUrl);


        validImage = isBlobMimeTypeImage(imageBlob) || imageBlob.size > 976000;
        attempts += 1;
    } while (!validImage);

    const agent = await loginToBluesky();

    console.log(`Uploading image as blob...`);
    const blobRef = await uploadBlobToBluesky(agent, imageBlob);


    await postToBluesky(image, blobRef, agent);
}

main();

async function postToBluesky(image: Image, blobRef: BlobRef, agent: BskyAgent) {
    const postText = `${image.title}\n${image.homepageUrl}`;
    const postAltText = `Photo titled "${image.title}" by Nine Inch Nails taken on ${image.date}`;
    const rt = new RichText({
        text: postText
    })
    await rt.detectFacets(agent) // automatically detects mentions and links
    const postRecord = {
        $type: 'app.bsky.feed.post',
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString(),
        embed: {
            $type: "app.bsky.embed.images",
            images: [{
                image: blobRef,
                alt: postAltText
            }]
        }
    }

    const postResponse = await agent.post(postRecord);

    console.log(`Just posted! ${postResponse.cid}`);
    console.log(`URI: ${postResponse.uri}`);
    postResponse.uri;
}

async function uploadBlobToBluesky(agent: BskyAgent, imageBlob: Blob): Promise<BlobRef> {
    const response = await agent.uploadBlob(await imageBlob.bytes(), {
        "encoding": "",
        "headers": {
            "Content-Type": imageBlob.type
        }
    });

    const blobRef = response.data.blob;
    console.log(`Successfully uploaded blob (ref=${blobRef.toJSON()})`);

    return blobRef;
}

async function loginToBluesky(): Promise<BskyAgent> {
    const agent = new BskyAgent({
        service: 'https://bsky.social',
    })

    console.log(`Logging in with ${process.env.BLUESKY_USERNAME!}...`);

    const response = await agent.login({ identifier: process.env.BLUESKY_USERNAME!, password: process.env.BLUESKY_PASSWORD! });

    console.log(`Logged in as @${response.data.handle}.`);

    return agent;
}

function isBlobMimeTypeImage(imageBlob: Blob) {
    return imageBlob.type.startsWith("image/");
}


