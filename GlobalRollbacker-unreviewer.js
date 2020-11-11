#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./redirect_credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const reportPage = 'User:DannyS712 bot III/Unreviewed.json';
const editSummary = 'Logging pages unreviewed (bot) - BOT in trial - [[Wikipedia:Bots/Requests for approval/DannyS712 bot III 72]]';

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
 * Query the replicas to pages to unreview
 * @returns {Array} Result of query.
 */
async function getPagesToUnreview() {
	const connection = getReplicaConnection();

	// Value for pagetriage_page.ptrp_reviewed for autopatrol
	const autopatrolStatus = 3;

	// Value for global_user_groups.gug_user for global rollbackers
	const globalGroupName = 'global-rollbacker';

	// Database with global user groups
	const centralDatabase = 'centralauth_p';

	log('Running query to fetch autopatrolled creations by global rollbackers');
	const sql = `
		SELECT
			page_id AS 'pageid',
			page_title AS 'title',
			gu_name AS 'creatorname',
			actor_user AS 'creatorid'
		FROM
			${centralDatabase}.global_user_groups
			JOIN ${centralDatabase}.globaluser ON gu_id = gug_user
			JOIN ${database}.actor ON actor_name = gu_name
			JOIN ${database}.pagetriage_page ON ptrp_last_reviewed_by = actor_user
			JOIN ${database}.page ON page_id = ptrp_page_id
		WHERE
			gug_group = '${globalGroupName}'
			AND ptrp_reviewed = ${autopatrolStatus}
			AND page_namespace = 0
			AND NOT EXISTS (
				SELECT 1
				FROM ${database}.user_groups
				WHERE ug_user = actor_user
				AND ug_group IN ('autoreviewer', 'sysop')
			)`;

	// Make database query synchronous.
	const fn = util.promisify(connection.query).bind(connection);
	return await fn(sql);
}

/**
 * Retrieve bot instance
 * @returns MWBot
 */
async function getBot() {
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
 * Update the report with the given content.
 * @param {String} content
 * @param {MWBot} bot
 * @returns {Promise<void>}
 */
async function updateReport(content, bot) {
	// Edit the page.
	log(`Writing to [[${reportPage}]]`);
	await bot.edit(reportPage, content, editSummary).catch(err => {
		const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
		log(`Failed to write to page: ${error}`);
	});
}

/**
 * Unreview the page
 * @param {int} pageid
 * @param {MWBot} bot
 * @returns {Promise<void>}
 */
async function unreviewPage( pageid, bot ) {
	log(`Unreviewing ${pageid}`);
	await bot.request( {
		action: 'pagetriageaction',
		pageid: pageid,
		reviewed: 0,
		token: bot.editToken
	} ).then( response => {
		console.log( response );
	} ).catch(err => {
		const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
		log(`Failed to unreview page: ${error}`);
	});
}

/**
 * Unreview the pages
 * @param {Array} pages to unreview
 * @param {MWBot} bot
 * @returns {bool} true
 */
async function unreviewPages( pages, bot ) {
	for (var lll = 0; lll < pages.length; lll++) {
		await unreviewPage( pages[lll].pageid, bot );
	}
	return true;
}

/**
 * @param {Array} pagesToUnreview
 * @returns {Array} JSON objects for logging
 */
async function formatForLog( pagesToUnreview ) {
	var asJSONArray = [];
	for ( var iii = 0; iii < pagesToUnreview.length; iii++ ) {
		asJSONArray.push( {
			pageid: parseInt( pagesToUnreview[iii].pageid ),
			title: pagesToUnreview[iii].title.toString().replace( /_/g, ' '),
			user: pagesToUnreview[iii].creatorname.toString()
		} );
	}
	return asJSONArray;
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
	const pagesToUnreview = await getPagesToUnreview();
	const bot = await getBot();
	
	const logReport = await formatForLog( pagesToUnreview );
	console.log( 'to unreview', logReport );
	const logReportAsString = await JSON.stringify( logReport );
	console.log( 'as string:', logReportAsString );
	
	await updateReport( logReportAsString, bot );

	if (argv.dry) {
		// Dry mode.
		console.log(logReportAsString);
	} else {
		await unreviewPages(pagesToUnreview, bot);
	}

	log('Task complete!');
	process.exit();
}

main().catch(console.error);
