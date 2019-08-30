declare module 'ethereumjs-blockchain' {
    import BN = require('bn.js');
    import Common from 'ethereumjs-common';
    import Block from 'ethereumjs-block';

    interface BlockchainInterface {
        putBlock(block: Block, cb: any, isGenesis?: boolean): void;
        delBlock(blockHash: Buffer, cb: any): void;
        getBlock(blockTag: Buffer | number | BN, cb: (err: Error | null, block?: Block) => void): void;
        iterator(name: string, onBlock: any, cb: any): void;
        getDetails(_: string, cb: any): void;
    }

    interface BlockchainOptions {
        chain?: string | number;
        hardfork?: string | null;
        common?: Common;
        db?: any;
        validate?: boolean;
        validatePow?: boolean;
        validateBlocks?: boolean;
    }

    export class Blockchain implements BlockchainInterface {
        _common: Common;
        _genesis: any;
        _headBlock: any;
        _headHeader: any;
        _heads: any;
        _initDone: boolean;
        _initLock: any;
        _putSemaphore: any;
        _staleHeadBlock: any;
        _staleHeads: any;
        db: any;
        dbManager: DBManager;
        ethash: any;
        public readonly validate: boolean;
        private readonly _validatePow: boolean;
        private readonly _validateBlocks: boolean;

        constructor(opts: BlockchainOptions);
        meta(): any;
        _init(cb: any): void;
        _setCanonicalGenesisBlock(cb: any): void;
        putGenesis(genesis: any, cb: any): void;
        getHead(name: any, cb?: any): void;
        getLatestHeader(cb: any): void;
        getLatestBlock(cb: any);
        putBlocks(blocks: Array<any>, cb: any);
        putBlock(block: object, cb: any, isGenesis?: boolean);
        putHeaders(headers: Array<any>, cb: any);
        putHeader(header: object, cb: any);
        _putBlockOrHeader(item: any, cb: any, isGenesis?: boolean);
        getBlock(blockTag: Buffer | number | BN, cb: any);
        _getBlock(blockTag: Buffer | number | BN, cb: any);
        getBlocks(blockId: Buffer | number, maxBlocks: number, skip: number, reverse: boolean, cb: any);
        getDetails(_: string, cb: any);
        selectNeededHashes(hashes: Array<any>, cb: any);
        _saveHeadOps();
        _saveHeads(cb: any);
        _deleteStaleAssignments(number: BN, headHash: Buffer, ops: any, cb: any);
        _rebuildCanonical(header: any, ops: any, cb: any);
        delBlock(blockHash: Buffer, cb: any);
        _delBlock(blockHash: Buffer | typeof Block, cb: any);
        _delChild(hash: Buffer, number: BN, headHash: Buffer, ops: any, cb: any);
        _iterator(name: string, func: any, cb: any);
        _batchDbOps(dbOps: any, cb: any): void;
        _hashToNumber(hash: Buffer, cb: any): void;
        _numberToHash(number: BN, cb: any): void;
        _lookupByHashNumber(hash: Buffer, number: BN, cb: any, next: any): void;
        _getHeader(hash: Buffer, number: any, cb?: any): void;
        _getCanonicalHeader(number: BN, cb: any): void;
        _getTd(hash: any, number: any, cb?: any): void;
        _lockUnlock(fn: any, cb: any): void;
    }

    class DBManager {
        _cache: { [k: string]: Cache<Buffer> };
        _common: any;
        _db: any;
        constructor(db: any, common: any);
        getHeads(): Promise<any>;
        getHeadHeader(): Promise<any>;
        getHeadBlock(): Promise<any>;
        getBlock(blockTag: Buffer | BN | number): Promise<any>;
        getBody(hash: Buffer, number: BN): Promise<Buffer>;
        getHeader(hash: Buffer, number: BN);
        getTd(hash: Buffer, number: BN): Promise<BN>;
        hashToNumber(hash: Buffer): Promise<BN>;
        numberToHash(number: BN): Promise<Buffer>;
        get(key: string | Buffer, opts: any = {}): Promise<any>;
        batch(ops: Array<any>): Promise<any>;
    }

    class Cache<V> {
        _cache: LRU<string, V>;
        constructor(opts: LRU.Options<string, V>);
        set(key: string | Buffer, value: V): void;
        get(key: string | Buffer): V | undefined;
        del(key: string | Buffer): void;
    }
}
