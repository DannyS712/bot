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
	return [ { user: 'DannyS712_test' } ];

	/**
	const connection = getReplicaConnection();

	log('Running query for users opted in');
	const sql = `
		SELECT page_title AS user
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
async function getBot(content) {
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
 async function remindUser( info, bot, dry ) {
	const userName = info.user;
	log(`Reminding user: ${userName}`);
	const scheduledReminders = await getUserReminders( userName, bot );
	console.log( scheduledReminders );
	const forToday = getForToday( scheduledReminders );
	console.log( forToday );
 }

/**
 * Get the JSON representing a user's scheduled reminders
 * Cannot query database, text isn't available there; use the api
 * @param {string} userName
 * @param {MWBot} bot
 * @return {Promise<array>}
 */
async function getUserReminders( userName, bot ) {
	return new Promise((resolve) => {
		let remindersTitle = 'User:' + userName + '/RemindMe.json';
		bot.request( {
			action: 'query',
			prop: 'revisions',
			titles: remindersTitle,
			rvslots: 'main',
			rvprop: 'content',
			formatversion: 2
	 	 } ).then( response => {
			console.log( response );
			let pageInfo = response.query.pages[0];
			let currentlyScheduled = [];
			if ( !pageInfo.missing ) {
				let rawJSON = pageInfo.revisions[0].slots.main.content;
				currentlyScheduled = JSON.parse( rawJSON );
			}
			resolve( currentlyScheduled );
		} ).catch(err => {
			const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
			log(`Api failure: ${error}`);
			resolve( [] )
		});
	});
}

/**
 * Filter for today's reminders
 *
 * @param {array} allReminders
 * @return array
 */
function getForToday( allReminders ) {
	let forToday = [];
	const today = new Date().toISOString().replace(/T.*/, '');
	for ( let jjj = 0; jjj < allReminders.length; jjj++ ) {
		let reminder = allReminders[jjj];
		if ( reminder && reminder[0] && reminder[0] === today && reminder[1] ) {
			console.log(`Reminder for today: ${reminder[1]}`);
			forToday.push( reminder[1] );
		} else {
			console.log(`Not for today: ${reminder}`);
		}
	}
	return forToday;
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
	const users = await getUsers();
	const bot = await getBot();
	for ( let iii = 0; iii < users.length; iii++ ) {
		await remindUser(users[iii], bot, argv.dry);
	}
	
	log('Task complete!');
	process.exit();
}

main().catch(console.error);
