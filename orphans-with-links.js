#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const reportPage = 'Wikipedia:Database reports/Orphans with incoming links';
const editSummary = 'Task 55: Update database report';

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
 * Query the replicas to get the polluted categories.
 * @returns {Array} Result of query.
 */
async function getLinkedOrpahns() {
    const connection = getReplicaConnection();

    log('Running query to fetch orphans with incoming links');
    const sql = `
        SELECT p.page_title AS page, COUNT(link.pl_from) AS count
        FROM ${database}.page p
        INNER JOIN ${database}.categorylinks c ON p.page_id = c.cl_from
          AND c.cl_to = 'All_orphaned_articles'
        INNER JOIN ${database}.pagelinks link ON p.page_title = link.pl_title
          AND p.page_namespace = link.pl_namespace
        INNER JOIN ${database}.page p2 ON p2.page_id = link.pl_from
        WHERE
          link.pl_from_namespace = 0
          AND p2.page_is_redirect = 0
        GROUP BY
          p.page_title
        HAVING
          COUNT(link.pl_from) > 2
        ORDER BY
          COUNT(link.pl_from) DESC, p.page_title ASC`;

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
    let table = '{| class="wikitable sortable" \n! Page !! Links';
    results.forEach(row => {
        table += `\n|-\n| [[${row.page.toString().replace(/_/g, ' ')}]] || ${row.count.toString()}`;
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
    const results = await getLinkedOrpahns();
    const content = 'Pages tagged as orphans with 2 or more incoming links; ' +
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
