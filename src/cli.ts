#!/usr/bin/env node

import { config } from 'dotenv';
import { AMTManager, PowerState } from './amt-manager';

// Load environment variables from .env file
config();

// Get command line arguments
const [command, host, username, password] = process.argv.slice(2);

// Get default values from environment variables
const defaultHost = process.env.AMT_HOST || '192.168.1.100';
const defaultUsername = process.env.AMT_USERNAME || 'admin';
const defaultPassword = process.env.AMT_PASSWORD || 'password';
const defaultPort = parseInt(process.env.AMT_PORT || '16992', 10);
const defaultProtocol = (process.env.AMT_PROTOCOL || 'http') as 'http' | 'https';

// Use provided values or defaults
const amtHost = host || defaultHost;
const amtUsername = username || defaultUsername;
const amtPassword = password || defaultPassword;

const printUsage = () => {
    console.log('\nUsage:');
    console.log('  amt-manager <command> [host] [username] [password]');
    console.log('\nCommands:');
    console.log('  power-on    - Power on the device');
    console.log('  power-off   - Power off the device');
    console.log('  reset       - Reset the device');
    console.log('  status      - Get current power state');
    console.log('  help        - Show this help message');
    console.log('\nParameters:');
    console.log('  host        - AMT device IP address (default: from AMT_HOST env var or 192.168.1.100)');
    console.log('  username    - AMT username (default: from AMT_USERNAME env var or admin)');
    console.log('  password    - AMT password (default: from AMT_PASSWORD env var or password)');
    console.log('\nEnvironment variables:');
    console.log('  AMT_HOST     - Default AMT device IP address');
    console.log('  AMT_USERNAME - Default AMT username');
    console.log('  AMT_PASSWORD - Default AMT password');
    console.log('  AMT_PORT     - Default AMT port (default: 16992)');
    console.log('  AMT_PROTOCOL - Default AMT protocol (default: http)');
}
// Validate required parameters
if (!amtHost || !amtUsername || !amtPassword) {
  console.error('Error: Missing required parameters');
  printUsage();
  process.exit(1);
}

// Create AMT manager instance
const amtManager = new AMTManager({
  host: amtHost,
  username: amtUsername,
  password: amtPassword,
  port: defaultPort,
  protocol: defaultProtocol
});

// Execute command
async function executeCommand() {
  try {
    switch (command) {
      case 'power-on':
        console.log(`Powering on device at ${amtHost}...`);
        const powerOnResult = await amtManager.powerOn();
        console.log(powerOnResult ? 'Device powered on successfully' : 'Failed to power on device');
        break;

      case 'power-off':
        console.log(`Powering off device at ${amtHost}...`);
        const powerOffResult = await amtManager.powerOff();
        console.log(powerOffResult ? 'Device powered off successfully' : 'Failed to power off device');
        break;

      case 'reset':
        console.log(`Resetting device at ${amtHost}...`);
        const resetResult = await amtManager.reset();
        console.log(resetResult ? 'Device reset successfully' : 'Failed to reset device');
        break;

      case 'status':
        console.log(`Getting power state for device at ${amtHost}...`);
        const powerState = await amtManager.getPowerState();
        const stateMap: Record<number, string> = {
          [PowerState.PowerOn]: 'Power On',
          [PowerState.PowerOff]: 'Power Off',
          [PowerState.Reset]: 'Reset'
        };
        console.log(`Current power state: ${stateMap[powerState] || 'Unknown'}`);
        break;

      case 'help':
        printUsage();
        break;
      default:
        console.error('Error: Invalid command');
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error occurred');
    process.exit(1);
  }
}

executeCommand(); 