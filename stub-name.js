#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const editSummary = 'Task 14: Correct stub name parameter';

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
    log('Establishing connection to the replicas (AfC)');
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
 * Query the replicas to get the error stub template.
 * @returns {Array} Result of query.
 */
async function getErrorStubs() {
    const connection = getReplicaConnection();

    log('Running query to fetch bad stub template');
    const sql = `
       SELECT page.page_id AS ID, page.page_title AS title FROM categorylinks
       JOIN page ON page_id = cl_from
       WHERE cl_to = 'Stub_message_templates_needing_attention'
       AND page_namespace = 10`;

    // Make database query synchronous.
    const fn = util.promisify(connection.query).bind(connection);
    return await fn(sql);
}

/**
 * Fix the stub template
 * @param {MWBot} bot
 * @param {Object} row
 * @param {Bool} dryRun
 * @returns {Promise<void>|void}
 */
async function fixStubTemplate( bot, row, dryRun ) {
  const title = 'Template:' + row.title;

  const pageID = parseInt( row.ID );
  const queryResult = await bot.read( title );
  const content = queryResult.query.pages[ pageID ].revisions[ 0 ][ '*' ];
  // replace until whitespace OR the } at the end of the template if
  // all on one line
  const newContent = content.replace( /(\|\s*name\s*=\s*)\S*?($|\s|})/i, "$1{{subst:FULLPAGENAME}}$2" );
  if ( dryRun ) {
    console.log( title, content, newContent );
    return;
  } else {
    return await bot.update( title, newContent, editSummary, { minor: true } );
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
    const stubs = await getErrorStubs();
    var dry;
    if ( argv.dry ) {
      dry = true;
    } else {
      dry = false
    }
    
    for ( var iii = 0; iii < stubs.length; iii++ ) {
      await fixStubTemplate( bot, stubs[iii], dry )
    }

    log('Task complete!');
    process.exit();
}

main().catch(console.error);
