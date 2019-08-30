declare module 'ethereumjs-common' {
    export class Common {
        private _hardfork: string | null;
        private _supportedHardforks: Array<string>;
        private _chainParams: Chain;
        forCustomChain(
            baseChain: string | number,
            customChainParams: Partial<Chain>,
            hardfork?: string | null,
            supportedHardforks?: Array<string>,
        ): Common;
        _getChainParams(chain: string | number): Chain;
        constructor(chain: string | number | object, hardfork?: string | null, supportedHardforks?: Array<string>);
        setChain(chain: string | number | object): any;
        setHardfork(hardfork: string | null): void;
        _chooseHardfork(hardfork?: string | null, onlySupported?: boolean): string;
        _getHardfork(hardfork: string): any;
        _isSupportedHardfork(hardfork: string | null): boolean;
        param(topic: string, name: string, hardfork?: string): any;
        paramByBlock(topic: string, name: string, blockNumber: number): any;
        hardforkIsActiveOnBlock(hardfork: string | null, blockNumber: number, opts?: hardforkOptions): boolean;
        activeOnBlock(blockNumber: number, opts?: hardforkOptions): boolean;
        hardforkGteHardfork(hardfork1: string | null, hardfork2: string, opts?: hardforkOptions): boolean;
        gteHardfork(hardfork: string, opts?: hardforkOptions): boolean;
        hardforkIsActiveOnChain(hardfork?: string | null, opts?: hardforkOptions): boolean;
        activeHardforks(blockNumber?: number | null, opts?: hardforkOptions): Array<any>;
        activeHardfork(blockNumber?: number | null, opts?: hardforkOptions): string;
        hardforkBlock(hardfork?: string): number;
        isHardforkBlock(blockNumber: number, hardfork?: string): boolean;
        consensus(hardfork?: string): string;
        finality(hardfork?: string): string;
        genesis(): any;
        hardforks(): any;
        bootstrapNodes(): any;
        hardfork(): string | null;
        chainId(): number;
        chainName(): string;
        networkId(): number;
    }

    interface hardforkOptions {
        onlySupported?: boolean;
        onlyActive?: boolean;
    }

    interface Chain {
        name: string;
        chainId: number;
        networkId: number;
        comment: string;
        url: string;
        genesis: GenesisBlock;
        hardforks: Hardfork[];
        bootstrapNodes: BootstrapNode[];
    }

    interface GenesisBlock {
        hash: string;
        timestamp: string | null;
        gasLimit: number;
        difficulty: number;
        nonce: string;
        extraData: string;
        stateRoot: string;
    }
    interface Hardfork {
        name: string;
        block: number | null;
        consensus: string;
        finality: any;
    }
    interface BootstrapNode {
        ip: string;
        port: number | string;
        network?: string;
        chainId?: number;
        id: string;
        location: string;
        comment: string;
    }
}
