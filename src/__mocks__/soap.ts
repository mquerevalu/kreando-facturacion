/**
 * Mock del módulo soap para pruebas
 */

export const createClientAsync = jest.fn();

export class WSSecurity {
  constructor(
    public username: string,
    public password: string,
    public options?: any
  ) {}
}

export interface Client {
  setSecurity: jest.Mock;
  sendBillAsync: jest.Mock;
  sendSummaryAsync: jest.Mock;
  getStatusAsync: jest.Mock;
}
