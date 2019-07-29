#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const reportPage = 'Wikipedia:Database reports/Polluted categories (3)';
const editSummary = 'Task 30: Update database report';

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
    log('Establishing connection to the replicas (PC3)');
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

    log('Running query to fetch polluted categories (3)');
    const sql = `
        SELECT CONCAT('[[:Category:', cl_to, ']]') AS category, COUNT(*) AS count
        FROM ${database}.categorylinks
        WHERE cl_to IN (
            SELECT page_title
            FROM page
            LEFT JOIN categorylinks
            ON page.page_id = categorylinks.cl_from
            WHERE cl_to = 'Container_categories'
        )
        AND cl_type = 'page'
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
    let table = '{| class="wikitable sortable" \n! Category !! Pages';
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
    });
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
    const results = await getPollutedCategories();
    const content = 'Container categories that contain pages; ' +
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
