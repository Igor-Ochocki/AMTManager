import fetch, { RequestInit, Response } from 'node-fetch';
import https from 'https';
import http from 'http';
import dns from 'dns';
import { promisify } from 'util';
import crypto from 'crypto';
import { getDigestHeader } from './digest-auth';

const lookup = promisify(dns.lookup);

export enum PowerState {
  PowerOn = 2,
  PowerOff = 8,
  Reset = 10
}

export interface AMTConfig {
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

interface SystemError extends Error {
  code?: string;
  errno?: string;
  type?: string;
}

export class AMTManager {
  private baseUrl: string = '';
  private auth: string;
  private config: AMTConfig;
  private agent: http.Agent | https.Agent | null = null;
  private resolvedHost: string;

  constructor(config: AMTConfig) {
    this.config = {
      port: 16992,
      protocol: 'http',
      timeout: 5000,
      retries: 3,
      verifySSL: false,
      forceIPv4: true,
      ...config
    };

    this.resolvedHost = config.host;
    this.auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  }

  private async resolveHost(): Promise<void> {
    try {
      const result = await lookup(this.config.host, {
        family: this.config.forceIPv4 ? 4 : 0,
        hints: this.config.forceIPv4 ? dns.ADDRCONFIG : 0
      });

      this.resolvedHost = result.address;
      console.log(`Resolved host ${this.config.host} to ${this.resolvedHost}`);

      const port = this.config.port;
      const protocol = this.config.protocol;
      this.baseUrl = `${protocol}://${this.resolvedHost}:${port}/wsman`;

      // Configure agent based on protocol
      if (protocol === 'https') {
        this.agent = new https.Agent({
          rejectUnauthorized: this.config.verifySSL,
          keepAlive: true,
          timeout: this.config.timeout,
          ciphers: 'ALL',
          secureProtocol: 'TLSv1_2_method',
          family: this.config.forceIPv4 ? 4 : undefined
        });
      } else {
        this.agent = new http.Agent({
          keepAlive: true,
          timeout: this.config.timeout,
          family: this.config.forceIPv4 ? 4 : undefined
        });
      }
    } catch (error) {
      console.error('Failed to resolve host:', error);
      throw new Error(`Failed to resolve host ${this.config.host}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async makeRequest(action: string, body: string, retryCount = 0): Promise<Response> {
    // Ensure host is resolved before making request
    if (!this.baseUrl || !this.agent) {
      await this.resolveHost();
    }
    const digestHeader = await getDigestHeader({ 
      url: this.baseUrl, 
      username: this.config.username, 
      password: this.config.password,
      method: 'POST',
      maxRetries: this.config.retries
    });

    const requestOptions = {
      method: 'POST',
      headers: {
        'Authorization': digestHeader,
        'Content-Type': 'application/soap+xml;charset=UTF-8',
        'SOAPAction': action,
        'User-Agent': 'Intel AMT Client',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      },
      body,
      agent: this.agent,
      timeout: this.config.timeout
    } as RequestInit;

    try {
      console.log(`Making request to ${this.baseUrl}`);
      console.log('Request headers:', requestOptions.headers);
      console.log('Request body:', body);

      const response = await fetch(this.baseUrl, requestOptions);
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const responseText = await response.text();
        console.error('Error response body:', responseText);
        throw new Error(`AMT request failed: ${response.status} ${response.statusText}\nResponse: ${responseText}`);
      }

      return response;
    } catch (error) {
      const systemError = error as SystemError;

      // Handle specific TLS/connection errors
      if (systemError.code === 'ECONNRESET' ||
          systemError.code === 'ETIMEDOUT' ||
          systemError.code === 'ECONNREFUSED' ||
          systemError.type === 'system') {

        if (retryCount < this.config.retries!) {
          console.log(`Connection attempt ${retryCount + 1} failed:`, {
            error: systemError.message,
            code: systemError.code,
            host: this.resolvedHost,
            port: this.config.port
          });

          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));

          // Try to resolve host again before retry
          await this.resolveHost();
          return this.makeRequest(action, body, retryCount + 1);
        }

        throw new Error(`Failed to connect to AMT device after ${this.config.retries} attempts. ` +
                       `Last error: ${systemError.message} (${this.resolvedHost}:${this.config.port})`);
      }

      throw error;
    }
  }

  private createPowerStateChangeRequest(powerState: PowerState): string {
    return `<?xml version="1.0" encoding="utf-8"?>
      <Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
                xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"
                xmlns="http://www.w3.org/2003/05/soap-envelope">
        <Header>
          <a:Action>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService/RequestPowerStateChange</a:Action>
          <a:To>/wsman</a:To>
          <w:ResourceURI>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService</w:ResourceURI>
          <a:MessageID>1</a:MessageID>
          <a:ReplyTo>
            <a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address>
          </a:ReplyTo>
          <w:OperationTimeout>PT60S</w:OperationTimeout>
        </Header>
        <Body>
          <r:RequestPowerStateChange_INPUT xmlns:r="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService">
            <r:PowerState>${powerState}</r:PowerState>
            <r:ManagedElement>
              <Address xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2004/08/addressing</Address>
              <ReferenceParameters xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">
                <ResourceURI xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ComputerSystem</ResourceURI>
                <SelectorSet xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
                  <Selector Name="CreationClassName">CIM_ComputerSystem</Selector>
                  <Selector Name="Name">ManagedSystem</Selector>
                </SelectorSet>
              </ReferenceParameters>
            </r:ManagedElement>
          </r:RequestPowerStateChange_INPUT>
        </Body>
      </Envelope>`;
  }

  private createGetPowerStateRequest(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope"
          xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
          xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">
  <Header>
    <a:To>/wsman</a:To>
    <a:Action>http://schemas.xmlsoap.org/ws/2004/09/transfer/Get</a:Action>
    <a:MessageID>uuid:${crypto.randomUUID()}</a:MessageID>
    <a:ReplyTo>
      <a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address>
    </a:ReplyTo>
    <w:ResourceURI>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_AssociatedPowerManagementService</w:ResourceURI>
    <w:SelectorSet>
      <w:Selector Name="UserOfService">
        <a:EndpointReference>
          <a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address>
          <a:ReferenceParameters>
            <w:ResourceURI>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ComputerSystem</w:ResourceURI>
            <w:SelectorSet>
              <w:Selector Name="CreationClassName">CIM_ComputerSystem</w:Selector>
              <w:Selector Name="Name">ManagedSystem</w:Selector>
            </w:SelectorSet>
          </a:ReferenceParameters>
        </a:EndpointReference>
      </w:Selector>
      <w:Selector Name="ServiceProvided">
        <a:EndpointReference>
          <a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address>
          <a:ReferenceParameters>
            <w:ResourceURI>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService</w:ResourceURI>
            <w:SelectorSet>
              <w:Selector Name="CreationClassName">CIM_PowerManagementService</w:Selector>
              <w:Selector Name="Name">Intel(r) AMT Power Management Service</w:Selector>
              <w:Selector Name="SystemCreationClassName">CIM_ComputerSystem</w:Selector>
              <w:Selector Name="SystemName">Intel(r) AMT</w:Selector>
            </w:SelectorSet>
          </a:ReferenceParameters>
        </a:EndpointReference>
      </w:Selector>
    </w:SelectorSet>
  </Header>
  <Body/>
</Envelope>`;
  }

  async changePowerState(powerState: PowerState): Promise<boolean> {
    try {
      const response = await this.makeRequest(
        'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_PowerManagementService/RequestPowerStateChange',
        this.createPowerStateChangeRequest(powerState)
      );

      const text = await response.text();
      console.log('Power state change response:', text);
      // Check if the response contains a success indicator
      return text.includes('ReturnValue>0</');
    } catch (error) {
      console.error('AMT power state change failed:', error);
      throw error;
    }
  }

  async powerOn(): Promise<boolean> {
    return this.changePowerState(PowerState.PowerOn);
  }

  async powerOff(): Promise<boolean> {
    return this.changePowerState(PowerState.PowerOff);
  }

  async reset(): Promise<boolean> {
    return this.changePowerState(PowerState.Reset);
  }

  async getPowerState(): Promise<number> {
    try {
      const response = await this.makeRequest(
        'http://schemas.dmtf.org/wbem/wscim/1/wsman/Enumerate',
        this.createGetPowerStateRequest()
      );

      const text = await response.text();
      console.log('Get power state response:', text);
      // Extract power state from response using CIM namespace
      const match = text.match(/<r:PowerState>(\d+)<\/r:PowerState>/);
      return match ? parseInt(match[1], 10) : -1;
    } catch (error) {
      console.error('Failed to get power state:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Try to get power state as a connection test
      await this.getPowerState();
      return true;
    } catch (error) {
      const systemError = error as SystemError;
      console.error('Connection test failed:', {
        error: systemError.message,
        code: systemError.code,
        type: systemError.type
      });
      return false;
    }
  }
} 