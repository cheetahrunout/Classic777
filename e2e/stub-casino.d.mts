export interface StubCasino {
  control: any;
  knobs: { failSettles: number; refundSettles: boolean };
  heartbeats: any[];
  rounds: Map<string, any>;
  sessions: Map<string, { player: string; open: boolean }>;
  players: Map<string, any>;
  listen(port?: number): Promise<string>;
  close(): Promise<void>;
}
export declare function createStubCasino(opts?: { key?: string }): StubCasino;
