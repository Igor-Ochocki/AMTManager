# AMT Manager

A Node.js tool for managing Intel AMT (Active Management Technology) devices. This tool provides both a command-line interface and a programmatic API to control power states of AMT-enabled devices.

## Features

- Power on/off AMT devices
- Reset AMT devices
- Check power state
- Secure authentication using Digest Authentication
- Support for both HTTP and HTTPS protocols
- IPv4 and IPv6 support
- Automatic retry with exponential backoff
- SSL verification options

## Prerequisites

- Node.js 14 or higher
- npm 6 or higher
- Intel AMT-enabled device
- Network access to the AMT device

## Installation

### As a Command Line Tool

1. Install globally:
```bash
npm install -g amt-manager
```

2. Create a `.env` file for optional settings:
```bash
cp .env.example .env
```

3. Edit the `.env` file with optional AMT device configuration:
```env
AMT_PORT=16992
AMT_PROTOCOL=http
AMT_VERIFY_SSL=false
AMT_FORCE_IPV4=true
```

4. Use the CLI commands:
```bash
# Basic usage
amt-manager power-on 192.168.1.100 admin password
amt-manager power-off 192.168.1.100 admin password
amt-manager reset 192.168.1.100 admin password
amt-manager status 192.168.1.100 admin password

# With optional settings from .env file
amt-manager power-on 192.168.1.100 admin password --port 16992 --protocol https
```

### As a Package in Your Project

1. Install the package:
```bash
npm install amt-manager
```

2. Import and use in your code:
```typescript
import { AMTManager, PowerState } from 'amt-manager';

// Create AMT manager instance
const amtManager = new AMTManager({
  host: '192.168.1.100',
  username: 'admin',
  password: 'your_password',
  port: 16992,
  protocol: 'http',
  verifySSL: false,
  forceIPv4: true
});

// Use the manager
async function manageDevice() {
  try {
    // Power on the device
    const powerOnResult = await amtManager.powerOn();
    console.log('Power on result:', powerOnResult);

    // Check power state
    const powerState = await amtManager.getPowerState();
    console.log('Current power state:', powerState);

    // Power off the device
    const powerOffResult = await amtManager.powerOff();
    console.log('Power off result:', powerOffResult);

    // Reset the device
    const resetResult = await amtManager.reset();
    console.log('Reset result:', resetResult);
  } catch (error) {
    console.error('Error managing device:', error);
  }
}
```

## Command Line Usage

The tool accepts the following command line arguments:

```bash
amt-manager <command> <host> <username> <password>
```

### Required Arguments
- `command`: The action to perform (power-on, power-off, reset, status)
- `host`: IP address or hostname of the AMT device
- `username`: AMT device username
- `password`: AMT device password

### Optional Environment Variables
| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| AMT_PORT | AMT device port | 16992 | No |
| AMT_PROTOCOL | Protocol to use (http/https) | http | No |
| AMT_VERIFY_SSL | Whether to verify SSL certificates | false | No |
| AMT_FORCE_IPV4 | Whether to force IPv4 connections | true | No |

## API Reference

### AMTManager Class

The main class for interacting with AMT devices.

#### Constructor

```typescript
constructor(config: AMTConfig)
```

#### Methods

- `powerOn(): Promise<boolean>` - Turn on the device
- `powerOff(): Promise<boolean>` - Turn off the device
- `reset(): Promise<boolean>` - Reset the device
- `getPowerState(): Promise<number>` - Get current power state
- `testConnection(): Promise<boolean>` - Test connection to the device

### Types

```typescript
interface AMTConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  protocol?: 'http' | 'https';
  timeout?: number;
  retries?: number;
  verifySSL?: boolean;
  forceIPv4?: boolean;
}

enum PowerState {
  PowerOn = 2,
  PowerOff = 8,
  Reset = 10
}
```

## Error Handling

The tool includes robust error handling:
- Automatic retry with exponential backoff for connection issues
- Detailed error messages for authentication failures
- Validation of required configuration
- Proper handling of SSL/TLS errors

## Security Notes

- Never commit your `.env` file containing credentials
- Use HTTPS when possible for secure communication
- Consider using environment variables in production environments
- Keep your AMT credentials secure and rotate them regularly

## License

MIT 