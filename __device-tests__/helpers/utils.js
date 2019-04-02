/**
 * @flow
 * @format
 * */

/**
 * External dependencies
 */
import childProcess from 'child_process';
import wd from 'wd';

/**
 * Internal dependencies
 */
import serverConfigs from './serverConfigs';
import { ios12, android8 } from './caps';
import _ from 'underscore';

const spawn = childProcess.spawn;

// Platform setup
const defaultPlatform = 'android';
const rnPlatform = process.env.TEST_RN_PLATFORM || defaultPlatform;

// Environment setup, local environment or Sauce Labs
const defaultEnvironment = 'local';
const testEnvironment = process.env.TEST_ENV || defaultEnvironment;

// Local App Paths
const defaultAndroidAppPath = './android/app/build/outputs/apk/debug/app-debug.apk';
const defaultIOSAppPath = './ios/build/gutenberg/Build/Products/Debug-iphonesimulator/gutenberg.app';

const localAndroidAppPath = process.env.ANDROID_APP_PATH || defaultAndroidAppPath;
const localIOSAppPath = process.env.IOS_APP_PATH || defaultIOSAppPath;

const localAppiumPort = serverConfigs.local.port; // Port to spawn appium process for local runs

// $FlowFixMe
const timer = ( ms: number ) => new Promise( ( res ) => setTimeout( res, ms ) );

const isAndroid = () => {
	return rnPlatform.toLowerCase() === 'android';
};

const isLocalEnvironment = () => {
	return testEnvironment.toLowerCase() === 'local';
};

// Initialises the driver and desired capabilities for appium
const setupDriver = async () => {
	const serverConfig = isLocalEnvironment() ? serverConfigs.local : serverConfigs.sauce;
	const driver = wd.promiseChainRemote( serverConfig );

	let desiredCaps;
	if ( isAndroid() ) {
		desiredCaps = _.clone( android8 );
		if ( isLocalEnvironment() ) {
			desiredCaps.app = localAndroidAppPath;
			try {
				const androidVersion = childProcess
					.execSync( 'adb shell getprop ro.build.version.release' )
					.toString()
					.replace( /^\s+|\s+$/g, '' );
				if ( ! isNaN( androidVersion ) ) {
					desiredCaps.platformVersion = androidVersion;
					console.log( 'Detected Android device running Android %s', androidVersion );
				}
			} catch ( error ) {
				// ignore error
			}
		} else {
			desiredCaps.app = 'sauce-storage:Gutenberg.apk'; // App should be preloaded to sauce storage, this can also be a URL
		}
	} else {
		desiredCaps = _.clone( ios12 );
		if ( isLocalEnvironment() ) {
			desiredCaps.app = localIOSAppPath;
		} else {
			desiredCaps.app = 'sauce-storage:Gutenberg.app.zip'; // App should be preloaded to sauce storage, this can also be a URL
		}
	}

	if ( ! isLocalEnvironment() ) {
		desiredCaps.name = `Gutenberg Editor Tests[${ rnPlatform }]`;
		desiredCaps.tags = [ 'Gutenberg' ];
	}

	await driver.init( desiredCaps );

	const status = await driver.status();
	// Display the driver status
	// eslint-disable-next-line no-console
	console.log( status );

	await driver.setImplicitWaitTimeout( 2000 );
	await timer( 3000 );
	return driver;
};

// Spawns an appium process in the background
const setupAppium = () => new Promise( ( resolve, reject ) => {
	const appium = spawn( 'appium', [
		'--port', '' + localAppiumPort,
		'--log', './appium-out.log',
		'--log-no-colors'
	] );

	let appiumOutputBuffer = '';
	let resolved = false;
	appium.stdout.on( 'data', ( data ) => {
		if ( ! resolved ) {
			appiumOutputBuffer += data.toString();
			if ( appiumOutputBuffer.indexOf( 'Appium REST http interface listener started' ) >= 0 ) {
				resolved = true;
				resolve( appium );
			}
		}
	} );

	appium.on( 'close', ( code ) => {
		if ( ! resolved ) {
			reject( new Error( `Appium process exited with code ${ code }` ) );
		}
	} );
} );

module.exports = {
	timer,
	setupAppium,
	setupDriver,
	isLocalEnvironment,
	isAndroid,
};
