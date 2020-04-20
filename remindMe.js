#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const editSummary = 'Post scheduled reminder - BOT in trial - [[Wikipedia:Bots/Requests for approval/DannyS712 bot 68]]';

/**
 * Log a message to stdout prepended with a timestamp.
 * @param {String} message
 */
function log(message) {
    const datestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log(`${datestamp}: ${message}`);
}
/**
 * Query the replicas to get the users opted in
 * @returns {Array} Result of query.
 */
async function getUsers() {
    return [ { user: 'DannyS712_test', page_id: 59118166 } ];

    /**
    const connection = getReplicaConnection();
    
    log('Running query for users opted in');
    const sql = `
        SELECT page_title AS user, page_id
        FROM ${database}.page
        JOIN ${database}.categorylinks
        ON page.page_id = categorylinks.cl_from
        WHERE cl_to = 'Users_using_remindMe'
        AND page_namespace = 2`;

    // Make database query synchronous.
    const fn = util.promisify(connection.query).bind(connection);
    return await fn(sql);
    */
}

/**
 * Get the bot object
 * @returns {Promise<MWBot>}
 */
async function updateReport(content) {
    // Login to the bot.
    log(`Logging in to bot account`);
    const bot = new MWBot({apiUrl});
    await bot.loginGetEditToken({
        apiUrl,
        username: credentials.username,
        password: credentials.password
    });

    return bot;
}

/**
 * Process a user
 *
 * TODO code
 *
 * @param {object} info
 * @param {MWBot} bot
 * @param {bool} dry
 */
 async function remindUser( info, bot, argv.dry ) {
    log(`Reminding user: ${info.user}`);
 }

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
    const users = await getUsers();
    const bot = await getBot();
    users.forEach(info => {
        await remindUser(info, bot, argv.dry);
    });

    log('Task complete!');
    process.exit();
}

main().catch(console.error);
