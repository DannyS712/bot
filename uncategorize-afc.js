#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const editSummary = 'Task 3: Disable the categories on this page while it is still a draft, per [[WP:DRAFTNOCAT]]/[[WP:USERNOCAT]]';

/**
 * Log a message to stdout prepended with a timestamp.
 * @param {String} message
 */
function log(message) {
    const datestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    console.log(`${datestamp}: ${message}`);
}

/**
 * Connect to the replicas.
 * @returns {Connection} A new MySQL connection.
 */
function getReplicaConnection() {
    log('Establishing connection to the replicas (PC2)');
    const connection = mysql.createConnection({
        host: credentials.db_host,
        port: credentials.db_port,
        user: credentials.db_user,
        password: credentials.db_password,
        database: credentials.db_database
    });
    connection.connect();
    return connection;
}

/**
 * Query the replicas to get the categorized drafts.
 * @returns {Array} Result of query.
 */
async function getCategorizedDrafts() {
    const connection = getReplicaConnection();

    log('Running query to fetch categorized afc submissions');
    const sql = `
       SELECT cl_from AS draft FROM categorylinks
       JOIN page ON page_id = cl_from
       WHERE cl_to = 'AfC_submissions_with_categories'
       AND page_namespace in (2, 118)`;

    // Make database query synchronous.
    const fn = util.promisify(connection.query).bind(connection);
    return await fn(sql);
}

/**
 * Remove the categories of a page
 * @param {MWBot} bot
 * @param {Number} pageID
 * @param {Bool} dryRun
 * @returns {Promise<void>|void}
 */
async function uncategorizePage( bot, pageID, dryRun ) {
  const content = await bot.readFromID( pageID );
  const newContent = content.replace( /\[\[Category/gi, '\[\[:Category' );
  if ( dryRun ) {
    console.log( pageID, content, newContent );
    return;
  } else {
    return await bot.updateFromID( pageID, newContent, editSummary, { minor: true } );
  }
}

/**
 * Create and return a bot instance
 * @returns {MWBot}
 */
async function botLogin() {
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
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
    const bot = await botLogin();
    const drafts = await getCategorizedDrafts();
    var dry;
    if ( argv.dry ) {
      dry = true;
    } else {
      dry = false
    }
    
    for ( var iii = 0; iii < drafts.length; iii++ ) {
      await uncategorizePage( bot, parseInt(drafts[iii].draft), dry )
    }

    log('Task complete!');
    process.exit();
}

main().catch(console.error);
