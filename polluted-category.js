#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const reportPage = 'Wikipedia:Database reports/Polluted categories (2)';
const editSummary = 'Task 28: Update database report';

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
    log('Establishing connection to the replicas');
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
 * Query the replicas to get the polluted categories.
 * @returns {Array} Result of query.
 */
async function getPollutedCategories() {
    const connection = getReplicaConnection();

    log('Running query to fetch polluted categories');
    const sql = `
        SELECT CONCAT('[[:Category:', cl_to, ']]') AS category, COUNT(*) AS count
        FROM ${database}.categorylinks
        WHERE cl_from IN (
            SELECT page_id
            FROM page
            WHERE page_namespace = 118
        )
        AND cl_to NOT LIKE '%AfC%'
        AND cl_to NOT LIKE '%raft%'
        AND cl_to NOT LIKE '%Pages%'
        AND cl_to NOT LIKE '%pages%'
        AND cl_to NOT LIKE '%edirect%'
        AND cl_to NOT LIKE '%CS1%'
        AND cl_to NOT LIKE '%deletion%'
        AND cl_to NOT LIKE '%rticles%'
        AND cl_to NOT LIKE '%emplate%'
        AND cl_to NOT LIKE '%with%'
        AND cl_to NOT LIKE '%tracking%'
        AND cl_to NOT LIKE '%nfobox%'
        GROUP BY cl_to
        ORDER BY COUNT(*) DESC`;

    // Make database query synchronous.
    const fn = util.promisify(connection.query).bind(connection);
    return await fn(sql);
}

/**
 * Create a wiki table for the results.
 * @param {Array} results
 * @returns {String} Wikitext.
 */
function getTableMarkup(results) {
    let table = '{| class="wikitable sortable" \n! Category !! Drafts';
    results.forEach(row => {
        table += `\n|-\n| ${row.category.toString().replace(/_/g, ' ')} || ${row.count.toString()}`;
    });
    return table += '\n|}';
}

/**
 * Update the report with the given content.
 * @param {String} content
 * @returns {Promise<void>}
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

    // Edit the page.
    log(`Writing to [[${reportPage}]]`);
    await bot.edit(reportPage, content, editSummary).catch(err => {
        const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
        log(`Failed to write to page: ${error}`);
        log(`Full error returned: ${err}`);
    });
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
    const results = await getPollutedCategories();
    const content = 'Categories that contain pages in the (main) namespace and the draft namespaces; ' +
        'data as of <onlyinclude>~~~~~</onlyinclude>. Updated by ~~~.\n\n' +
        getTableMarkup(results);

    if (argv.dry) {
        // Dry mode.
        console.log(content);
    } else {
        await updateReport(content);
    }

    log('Task complete!');
    process.exit();
}

main().catch(console.error);
