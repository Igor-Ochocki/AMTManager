import { AMTManager } from './amt-manager';
import dotenv from 'dotenv';

// Load environment variables for optional settings
dotenv.config();

// Get command line arguments
const [command, host, username, password] = process.argv.slice(2);

// Validate required arguments
if (!command || !host || !username || !password) {
  console.error('Usage: amt-manager <command> <host> <username> <password>');
  console.error('\nCommands:');
  console.error('  power-on  - Turn on the system');
  console.error('  power-off - Turn off the system');
  console.error('  reset     - Reset the system');
  console.error('  status    - Get current power state');
  console.error('\nExample:');
  console.error('  amt-manager power-on 192.168.1.100 admin password');
  process.exit(1);
}

// Get optional configuration from environment variables
const config = {
  host,
  username,
  password,
  port: process.env.AMT_PORT ? parseInt(process.env.AMT_PORT) : undefined,
  protocol: process.env.AMT_PROTOCOL as 'http' | 'https' | undefined,
  verifySSL: process.env.AMT_VERIFY_SSL === 'true',
  forceIPv4: process.env.AMT_FORCE_IPV4 !== 'false'
};

// Create AMT manager instance
const amtManager = new AMTManager(config);

// Execute command
async function executeCommand() {
  try {
    switch (command) {
      case 'power-on':
        const powerOnResult = await amtManager.powerOn();
        console.log('Power on command result:', powerOnResult);
        break;

      case 'power-off':
        const powerOffResult = await amtManager.powerOff();
        console.log('Power off command result:', powerOffResult);
        break;

      case 'reset':
        const resetResult = await amtManager.reset();
        console.log('Reset command result:', resetResult);
        break;

      case 'status':
        const powerState = await amtManager.getPowerState();
        console.log('Current power state:', powerState);
        break;

      default:
        console.error('Invalid command. Available commands:');
        console.error('  power-on  - Turn on the system');
        console.error('  power-off - Turn off the system');
        console.error('  reset     - Reset the system');
        console.error('  status    - Get current power state');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error executing command:', error);
    process.exit(1);
  }
}

executeCommand();

export { AMTManager };
export { PowerState } from './amt-manager';
export type { AMTConfig } from './amt-manager'; 