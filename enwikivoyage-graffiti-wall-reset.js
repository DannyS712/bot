#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikivoyage.org/w/api.php';
const editSummary = 'BOT: Reset graffiti wall';

/**
 * Log a message to stdout prepended with a timestamp.
 * @param {String} message
 */
function log(message) {
	const datestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	console.log(`${datestamp}: ${message}`);
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
	const pageContent = '{{subst:User:DannyS712 bot/reset}}';
	log(`Resetting graffiti wall`);
	await bot.edit( 'Wikivoyage:Graffiti wall', pageContent, editSummary ).catch(err => {
		const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
		log(`Failed to write to page: ${error}`);
	});
	log('Task complete!');
	process.exit();
}

main().catch(console.error);
