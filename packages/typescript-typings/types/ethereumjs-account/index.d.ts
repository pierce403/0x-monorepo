declare module 'ethereumjs-account' {
    export default class Account {
        public nonce!: Buffer;
        public balance!: Buffer;
        public stateRoot!: Buffer;
        public codeHash!: Buffer;
        constructor(data?: any);
        serialize(): Buffer;
        getCode(trie: Trie, cb: TrieGetCb): void;
        setCode(trie: Trie, code: Buffer, cb: (err: any, codeHash: Buffer) => void): void;
        getStorage(trie: Trie, key: Buffer | string, cb: TrieGetCb);
        setStorage(trie: Trie, key: Buffer | string, val: Buffer | string, cb: () => void);
        isEmpty(): boolean;
    }

    interface TrieGetCb {
        (err: any, value: Buffer | null): void;
    }
    interface TriePutCb {
        (err?: any): void;
    }

    interface Trie {
        root: Buffer;
        copy(): Trie;
        getRaw(key: Buffer, cb: TrieGetCb): void;
        putRaw(key: Buffer | string, value: Buffer, cb: TriePutCb): void;
        get(key: Buffer | string, cb: TrieGetCb): void;
        put(key: Buffer | string, value: Buffer | string, cb: TriePutCb): void;
    }
}
