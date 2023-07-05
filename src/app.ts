/**
 *
 */

// ==================== Imports ==================== //
import * as fs from "fs";

const chalk = require("chalk");
import logger from "loglevel"
import axios from "axios";
require("dotenv").config();
const { program } = require("commander");
const { version } = require("../package.json");

import {SteamInventory, SteamItem, processInventoryItems} from "./models/SteamZtuff";

const steamInventoryModule = require("@xfaider/node-steam-inventory");
const steamInventory = new steamInventoryModule.SteamUserInventory(); // options can be provided in constructor for GOT module for endpoint requests

// ==================== Globals ==================== //

global.assetids = [];

// ==================== Constants ==================== //

/**
 * @default Default assetid URLs to fetch from
 * In this case, these are the URLs for the assetids of TF2 items and keys which were involved in the massive Gladiator.tf MiTM passport-steam exploit of 2023.
 * The format here is backpack.tf links, which contain simply on each line the assetid of the item after removing (if present) the "https://backpack.tf/item/" prefix.
 */
const DEFAULT_ASSETID_URLS: string[] =
    ["https://gist.githubusercontent.com/Moder112/4fc10d3eb85189f974def6fa6f021d37/raw/GladiatorTF%2520Exploit%2520-%2520Items",
    "https://gist.githubusercontent.com/Moder112/d8be3cc3faeb191bdcfe8fb5fe085ab7/raw/GladiatorTF%2520Exploit%2520-%2520Keys"];

const APPID_TF2: number = 440;

// ==================== Models ==================== //
class AssetIDMatch {
    assetid: string;
    item: any;
    constructor(assetid: string, item: any) {
        this.assetid = assetid;
        this.item = item;
    }

    getLink(): string {
        return `https://backpack.tf/item/${this.assetid}`;
    }

    toString(): string {
        return `${this.item.name}: ${this.getLink()}`;
    }
}

// ==================== Helper Functions ==================== //
function parseAssetidList(assetidList: string): string[] {
    let assetids: string[] = assetidList.split("\n");
    assetids = assetids.map((assetid: string) => assetid.trim()).map((assetid: string) => assetid.replace("https://backpack.tf/item/", ""));
    logger.debug(`assetids: ${assetids}`);
    return assetids;
}

function readAssetidFiles(assetidFiles: string[]): string[] {
    let assetids: string[] = [];
    assetidFiles.forEach((assetidFile: string) => {
        let fileContents: string = fs.readFileSync(assetidFile, "utf8");
        assetids = assetids.concat(parseAssetidList(fileContents));
    });
    return assetids;
}

async function fetchAssetidUrls(assetidUrls: string[]): Promise<string[]> {
    let assetids: string[] = [];
    assetidUrls.forEach((assetidUrl: string) => {
        axios.get(assetidUrl).then((response: any) => {
            logger.debug(`response.data: ${response.data}`);
            assetids = assetids.concat(parseAssetidList(response.data));
        }).catch((error: any) => {
            logger.error(chalk.red(`Error fetching assetids from ${assetidUrl}`));
            logger.trace(error);
            return Promise.reject(error);
        });
    });
    return Promise.resolve(assetids);
}

function matchAssetids(assetids: string[], inventory: SteamInventory): AssetIDMatch[] {
    let matches: AssetIDMatch[] = [];

    assetids.forEach((assetid: string) => {
        let item: SteamItem = inventory.rgInventory[assetid];
        if (item) {
            matches.push(new AssetIDMatch(assetid, item));
        }
    });

    return matches.length > 0 ? matches : null;
}

// ==================== Main ==================== //
async function main() {
    // Parse command line arguments
    program
        .version(version)
        .option("-s, --steamid64 <steamid64>", "SteamID64 of the user to fetch")
        .option("-af, --assetid_files [<filepath1>...<filepathN>]", "List of filepaths containing assetids to fetch (comma separated)", null)
        .option("-au, --assetid_urls [<url1>...<urlN>]", "list of URLs containing assetids to fetch (comma separated)", DEFAULT_ASSETID_URLS.join(","))
        .option("-v, --verbose", "Verbose output")
        .option("-d, --debug", "Debug output")
        .option("-l, --log_level <level>", "Log level", "DEBUG", /^(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)$/i, "DEBUG")
        .parse(process.argv);

    //       .argument("<steamlink>", "Steam link of the user to fetch", /https:\/\/steamcommunity\.com\/profiles\/[0-9]{17}/i, null)

    const options = program.opts();
    console.log(`options: ${JSON.stringify(options, null, 4)}`);

    let logl: string = "DEBUG";
    // handle log level //
    if(!options.log_level) {
        if (options.debug) {
            logl = "DEBUG";
        }
        if (options.verbose) {
            logl = "TRACE";
        }
    } else {
        logl = options.log_level.toUpperCase();
    }
    logger.setLevel("DEBUG");

    // handle assetid_file or assetid_url //
    if (options.assetid_file && options.assetid_url) {
        logger.error(chalk.red("Cannot specify both assetid_file and assetid_url -- please specify only one, or none"));
        process.exit(1);
    } else if (options.assetid_files) {
        logger.info(chalk.bold("assetid file list specified, reading..."));
        logger.debug(`assetid_files: ${options.assetid_files}`);
        global.assetids = readAssetidFiles(options.assetid_files);
    } else if (options.assetid_urls) {
        logger.info(chalk.bold("assetid urls specified, fetching..."));
        logger.debug(`assetid_urls: ${options.assetid_urls.split(",")}`);
        global.assetids = await fetchAssetidUrls(options.assetid_urls.split(","));
    } else {
        logger.warn(chalk.bold("No assetid files or urls specified, using default assetid urls..."));
        global.assetids = await fetchAssetidUrls(DEFAULT_ASSETID_URLS);
    }

    // handle steamid64 or steamlink //
    logger.debug(`steamid64: ${options.steamid64}`);
    // logger.debug(`steamlink: ${options.steamlink}`);

    if (options.steamid64 /*&& options.steamlink*/ ) {
        // prefer steamid64
        //logger.warn(chalk.bold("Both steamid64 and steamlink specified, using steamid64..."));
        global.steamid = options.steamid64;
    }
        // } else if (args.steamlink) {
    //     logger.info(chalk.bold("steamlink specified, fetching steamid64..."));
    //     logger.debug(`steamlink: ${options.steamlink}`);
    //     // remove trailing slash if present
    //     if(options.steamlink.charAt(options.steamlink.length-1) === "/") {
    //         options.steamlink = options.steamlink.substring(0, options.steamlink.length-1);
    //     }
    //     global.steamid = options.steamlink.substring(options.steamlink.lastIndexOf("/")+1, options.steamlink.length);
    // }

    // ==================== Validation ==================== //

    if(!global.steamid) {
        logger.error(chalk.red("No steamid64 found!"));
        process.exit(1);
    } else {
        if(/^[0-9]{17}$/i.test(global.steamid)) {
            logger.info(chalk.bold.green("steamid64 is valid!"));
        } else {
            logger.error(chalk.red("steamid is invalid!"));
            process.exit(1);
        }
    }

    if(global.assetids.length == 0) {
        logger.error(chalk.red("No assetids fetched!"));
        process.exit(1);
    } else {
        logger.info(chalk.bold.green("done."));
        logger.info(chalk.italic(`Fetched ${global.assetids.length} assetids`));
    }

    // validate api key //
    // WE DO NOT NEED API KEY ANYMORE
    /*
    // check environment variable, if present override command line argument
    if(process.env.STEAM_API_KEY) {
        program.apikey = process.env.STEAM_API_KEY;
    }

    if(!program.apikey) {
        logger.error(chalk.red("No API key found!"));
        process.exit(1);
    }

    if(!/^[0-9A-F]{32}$/i.test(program.apikey)) {
        logger.error(chalk.red("Invalid API key!"));
        process.exit(1);
    } else {
        //valid apikey
        logger.info(chalk.bold.green("API key is valid."));

        //logger.debug(`API key: ${program.apikey}`)
    }
    */

    // ==================== Execution ==================== //
    console.log("=========================================");

    // start steam-inventory and get tf2 inventory steamid64
    logger.info(chalk.gray.italic('getting tf2 inventory of user with steamid64: ') + chalk.inverse(global.steamid));
    steamInventory.load({steamId: global.steamid, appId: APPID_TF2, contextId: 2, language: "english"}, false).then((responses: any) => {
        if(responses) {
            matchAssetids(global.assetids, responses as SteamInventory).forEach((match: AssetIDMatch) => {
                logger.info(chalk.bold.red(`found match for assetid ${match.assetid}`));
                logger.debug(`assetid: ${match.assetid}`);
                logger.debug(`item: ${match.item}`);
                logger.info(`item name: ${match.item.name}`);
                logger.info(chalk.blueBright.italic.underline(`${match.getLink()}`));
            });
        }
    });

    // Finished
    console.log("=========================================");
    logger.info(chalk.bold.green("done."));
}

main();