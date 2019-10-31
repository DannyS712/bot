#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./redirect_credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const reportPage = 'User:DannyS712 bot III/Redirects.json';
const editSummary = 'Redirects to patrol (bot)';

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
    log('Establishing connection to the replicas (redirect patroller)');
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
 * Query the replicas to possible redirects for patrolling
 * @returns {Array} Result of query.
 */
async function getRecentRedirects() {
    const connection = getReplicaConnection();

    log('Running query to fetch unpatrolled redirects');
    const sql = `
        SELECT
          page_id AS 'pageid',
          page_title AS 'title',
          ptrpt_value AS 'target'
        FROM
          ${database}.page
          JOIN ${database}.pagetriage_page ON page_id = ptrp_page_id
          JOIN ${database}.pagetriage_page_tags ON ptrp_page_id = ptrpt_page_id
        WHERE
          ptrp_reviewed = 0
          AND ptrpt_tag_id = 9
          AND page_namespace = 0
          AND page_is_redirect = 1
          AND ptrp_created > (DATE_FORMAT((NOW() - INTERVAL 1 DAY), '%Y%m%d%H%i%S'))`;

    // Make database query synchronous.
    const fn = util.promisify(connection.query).bind(connection);
    return await fn(sql);
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
 * Filter redirects to only include those that can be patrolled
 * @param {Array} redirects all redirects
 * @returns {Array} redirects that can be patrolled
 */
function getPatrollableRedirects( redirects ) {
    var patrollable = []
    for ( var iii = 0; iii < redirects.length; iii++ ) {
        if ( shouldPatrol( redirects[iii] ) ) {
            patrollable.push( redirects[iii] );
        }
    }
    return patrollable;
}

/**
 * Determine if a specific redirect should be patrolled
 * @param {Object} redirect information
 * @returns {bool} if the redirect should be patrolled
 */
function shouldPatrol( redirect ) {
    var target = redirect.target.toString().replace( /REDIRECT /i, '');
    var title = redirect.title.toString();
    ///*
    if (target === title.replace( / \(disambiguation\)/i, '')) return true;
    if (comparePages( target, title )) return true;
    if (comparePages( target + 's', title ) ) return true;
    if (comparePages( target + 'es', title ) ) return true;
    if (comparePages( target.replace( /[’'‘]/g, '\'' ), title.replace( /[’'‘]/g, '\'' ) ) ) return true;
    if (comparePages( target, title.replace( /(\w*), (\w*)/, '$2 $1' ) ) ) return true;
    if (comparePages( target, 'List of ' + title ) ) return true;
    if (comparePages( target.replace( /[ -]/g, '' ), title.replace( /[ -]/g, '' ) ) ) return true;
    if (comparePages( target.replace( / vs?\.? /g, 'v.' ), title.replace( / vs?\.? /g, 'v.' ) ) ) return true;
    if (comparePages( target.replace( /^The /, '' ), title.replace( /^The /g, '' ) ) ) return true;
    if (comparePages( target.replace( /[-‒–—―]/g, '-'), title.replace( /[-‒–—―]/g, '-' ) ) ) return true;
    //*/
    return false;
}

/**
 * Compare a redirect's title and target
 * @param {String} target
 * @param {String} title
 * @returns {bool} if the redirect should be patrolled
 */
function comparePages( target, title ) {
    var comparison = target.localeCompare( title, 'en', {sensitivity: 'base'} );
    if (comparison === 0) return true;
    return false;
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
    const results = await getRecentRedirects();
    const patrollable = getPatrollableRedirects( results );
    const patrollableAsJSON = JSON.stringify( patrollable, null, 2 );

    if (argv.dry) {
        // Dry mode.
        console.log(patrollableAsJSON);
    } else {
        await updateReport(patrollableAsJSON);
    }

    log('Task complete!');
    process.exit();
}

main().catch(console.error);
