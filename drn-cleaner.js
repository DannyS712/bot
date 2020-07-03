#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const noticeboard = 'Wikipedia:Dispute resolution noticeboard';
const editSummary = 'Task 69: Remove do not archive tags from closed cases';

/**
 * Log a message to stdout prepended with a timestamp.
 * @param {String} message
 */
function log(message) {
    const datestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log(`${datestamp}: ${message}`);
}

/**
 * Update the noticeboard
 * @param {bool} dryRun
 * @returns {Promise<void>}
 */
async function cleanupNoticeboard(dryRun) {
    // Login to the bot.
    log(`Logging in to bot account`);
    const bot = new MWBot({apiUrl});
    await bot.loginGetEditToken({
        apiUrl,
        username: credentials.username,
        password: credentials.password
    });

    // Get the current content
    const queryResult = await bot.readWithProps(
        noticeboard,
        'content|ids'
    );
    const revision = queryResult.query.pages[ 31934316 ].revisions[ 0 ];
    const content = revision[ '*' ];
    const baseRevId = revision[ 'revid' ];
    const newContent = content.replace( /({{DR case status\|(?:reject|resolve(?:d)?|fail(?:ed)?|close(?:d)?)}})\n<!-- \[\[User:DoNotArchiveUntil.*?-->{{User:ClueBot III\/DoNotArchiveUntil\|\d+}}<!--.*?-->/g, "$1" );

    // Edit the page.
    if ( dryRun ) {
        log( content, newContent );
        return;
    } else {
        return await bot.update( noticeboard, newContent, editSummary, { minor: true, baserevid: baseRevId } );
    }
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
    await cleanupNoticeboard(argv.dry);
    log('Task complete!');
    process.exit();
}

main().catch(console.error);
