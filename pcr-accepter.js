#!/usr/bin/env node

// Dependencies.
const argv = require('minimist')(process.argv.slice(2));
const MWBot = require('mwbot');
const mysql = require('mysql');
const util = require('util');

const credentials = require('./PCR_credentials'); // Load credentials from config.
const apiUrl = 'https://en.wikipedia.org/w/api.php';
const database = 'enwiki_p';
const acceptSummary = 'Automatically accept, no net change - BOT in trial - [[Wikipedia:Bots/Requests for approval/DannyS712 bot IV 65|BRFA]]';

/**
 * Log a message to stdout prepended with a timestamp.
 * @param {String} message
 */
function log(message) {
	const datestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
	console.log(`${datestamp}: ${message}`);
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
 * Accept the null changes
 * @param {int} revid
 * @param {MWBot} bot
 * @returns {Promise<void>}
 */
async function acceptNoChange( revid, bot ) {
	log(`Accepting revision ${revid}`);
	await bot.request( {
		action: 'review',
		revid: revid,
		comment: acceptSummary,
		token: bot.editToken
	} ).then( response => {
	  console.log( response );
	} ).catch(err => {
		const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
		log(`Failed to accept edits: ${error}`);
	});
}

/**
 * Get all pending changes
 * @param {MWBot} bot
 * @returns {Promise<Array|false>} pending changes
 */
function getPending( bot ) {
	log(`Querying pending changes via api`);
  return new Promise((resolve) => {
	  bot.request( {
		  action: 'query',
      list: 'oldreviewedpages',
      ormaxsize: 0,
      ornamespace: '*',
      orlimit: 'max',
      formatversion: 2,
	  } ).then( response => {
      console.log( response );
      resolve( response );
	  } ).catch(err => {
		  const error = err.response && err.response.error ? err.response.error.code : 'Unknown';
		  log(`Failed to accept edits: ${error}`);
      resolve( false )
	  });
  });
}

/**
 * Entry point for the bot task.
 * @returns {Promise<void>}
 */
async function main() {
	const bot = await getBot();
	const allPending = await getPending( bot );
	console.log( 'allPending', allPending );
	const pending = allPending.query.oldreviewedpages;
	console.log( 'pending', pending );
	for ( var iii = 0; iii < pending.length; iii++ ) {
		console.log( pending[iii].stable_revid, pending[iii].revid );
	}
/*
	if (argv.dry) {
		// Dry mode.
		console.log(patrollableAsString);
	} else {
		await patrolRedirects(patrollable, bot);
	}
*/
	log('Task complete!');
	process.exit();
}

main().catch(console.error);
