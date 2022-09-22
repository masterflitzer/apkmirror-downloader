import { readFile } from "fs/promises";
import { createWriteStream } from "fs";
import { JSDOM } from "jsdom";
import fetch from "node-fetch";
import { argv, exit } from "process";

import type { Config } from "./types";

const args = argv.slice(2);

const configPath = args[0];
if (configPath == null) {
    console.info("\tUSAGE: npm start ./apps.json");
    console.info();
    exit(0);
}

let apps: Config;
try {
    const json = await readFile(configPath, { encoding: "utf-8" });
    apps = JSON.parse(json);
} catch (error) {
    throw new Error(
        "Couln't parse config file, make sure you provided the correct path and the file contains valid json"
    );
}

const baseURL = "https://apkmirror.com";

const downloadFunctions = [
    getLatestStableURL,
    getNonBundleURL,
    getDownloadPageURL,
    getDirectDownloadURL,
];

const downloads = apps.map(({ packageName, urlPath }) =>
    downloadApp(packageName, urlPath)
);
await Promise.allSettled(downloads);

async function downloadApp(name: string, urlPath: string): Promise<void> {
    if (!name || !urlPath)
        throw new Error(
            "At least one empty argument was passed to this function"
        );

    let document;
    let url = new URL(urlPath, baseURL);

    downloadFunctions.forEach(async (func) => {
        url = new URL(urlPath, baseURL);
        document = await getDocumentFromURL(url);
        urlPath = func(document);
    });

    await download(name, new URL(urlPath, baseURL));
}

function getLatestStableURL(document: Document): string {
    const containers = queryAll(document.body, ".listWidget");
    const versionContainer = findContainerWithHeading(
        containers,
        "All versions"
    );
    const versions = queryAll(
        versionContainer,
        ".appRow .appRowTitle > a"
    ) as NodeListOf<HTMLAnchorElement>;

    const latestStable = Array.from(versions)
        .filter((x) => x != null)
        .find((x) => {
            return !(
                x.textContent?.toLowerCase().includes("alpha") ||
                x.textContent?.toLowerCase().includes("beta")
            );
        });

    if (latestStable == null) {
        const moreUploads = versionContainer.querySelector(
            ":scope > :last-child a"
        ) as HTMLAnchorElement | null;
        if (moreUploads != null) {
            console.error(
                `Here you can manually browse the latest APKs: ${moreUploads.href}`
            );
        }
        throw new Error("Couldn't find anchor element for latest stable APK");
    }

    return latestStable.href;
}

function getNonBundleURL(document: Document): string {
    const containers = queryAll(document.body, ".listWidget");
    const downloadContainer = findContainerWithHeading(containers, "Download");
    const downloads = queryAll(
        downloadContainer,
        ":scope > :last-child a"
    ) as NodeListOf<HTMLAnchorElement>;

    const nonBundleDownload = Array.from(downloads)
        .filter((x) => x != null)
        .filter((x) => {
            const length = x.parentElement?.children.length;
            return length != null && length > 1;
        })
        .find((x) => {
            const badges = queryAll(x.parentElement, ".apkm-badge");
            const isBundle = Array.from(badges).some((x) =>
                x.textContent?.toLowerCase().includes("bundle")
            );
            return !isBundle;
        });

    if (nonBundleDownload == null) {
        throw new Error(
            "Couldn't find anchor element for normal/non-bundled APK"
        );
    }

    return nonBundleDownload.href;
}

function getDownloadPageURL(document: Document): string {
    const downloadPageButton = document.querySelector(
        ".card-with-tabs .tab-content #file a.downloadButton"
    ) as HTMLAnchorElement | null;
    if (downloadPageButton == null)
        throw new Error("Couldn't find anchor element for APK download page");
    return downloadPageButton.href;
}

function getDirectDownloadURL(document: Document): string {
    const directDownloadButton = document.querySelector(
        ".card-with-tabs a"
    ) as HTMLAnchorElement | null;
    if (directDownloadButton == null)
        throw new Error("Couldn't find anchor element for direct APK download");
    return directDownloadButton.href;
}

function findContainerWithHeading(
    list: NodeListOf<Element>,
    text: string
): Element {
    const result = Array.from(list).find((x) =>
        x.querySelector(":scope > .widgetHeader")?.textContent?.includes(text)
    );
    if (result == null)
        throw new Error("Couldn't find container with matching heading");
    return result;
}

function queryAll(
    element: Element | null,
    selectors: string
): NodeListOf<Element> {
    const list = element?.querySelectorAll(selectors);
    if (list == null || list.length === 0)
        throw new Error("Couldn't find a matching element for selector");
    return list;
}

async function getDocumentFromURL(url: URL): Promise<Document> {
    const response = await fetch(url.href);
    const text = await response.text();
    const root = new JSDOM(text).window.document;
    if (root == null)
        throw new Error("An error occured while trying to parse the page");
    return root;
}

async function download(name: string, url: URL): Promise<void> {
    const dl = fetch(url.href);
    const fileStream = createWriteStream(`${name}.apk`);
    const response = await dl;
    const body = response.body;
    if (body == null)
        throw new Error("An error occured while trying to download the file");
    body.pipe(fileStream);
}
