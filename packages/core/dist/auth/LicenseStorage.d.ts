/**
 * Atomic license-token storage for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
export type StoredLicenseRecord = Readonly<{
    version: 1;
    revision: number;
    token: string;
    lastTrustedTime: number;
    lastOnlineAt: number;
}>;
export type LicenseStorageReadResult = {
    ok: true;
    record: StoredLicenseRecord;
    recovered: boolean;
} | {
    ok: false;
    code: 'not_found' | 'corrupt_storage' | 'rollback_detected';
};
export type LicenseStorageWriteResult = {
    ok: true;
    record: StoredLicenseRecord;
} | {
    ok: false;
    code: 'corrupt_storage' | 'rollback_detected' | 'invalid_record';
};
export interface AtomicLicenseStorageOptions {
    directory: string;
    filename?: string;
    /** Injectable filesystem boundary for deterministic crash/recovery testing. */
    fileSystem?: LicenseStorageFileSystem;
}
export interface LicenseStorageFileSystem {
    existsSync(path: string): boolean;
    mkdirSync(path: string, options: {
        recursive: true;
    }): string | undefined;
    readFileSync(path: string, encoding: BufferEncoding): string;
    writeFileSync(path: string, content: string, options: {
        encoding: BufferEncoding;
        mode: number;
    }): void;
    renameSync(from: string, to: string): void;
}
/**
 * Durable file storage that writes a replacement atomically and retains the last
 * complete record as a recoverable previous version. It never accepts a lower
 * primary revision than the retained previous revision.
 */
export declare class AtomicLicenseStorage {
    private readonly currentPath;
    private readonly previousPath;
    private readonly fileSystem;
    constructor(options: AtomicLicenseStorageOptions);
    read(): LicenseStorageReadResult;
    write(record: unknown): LicenseStorageWriteResult;
    private readRecord;
    private atomicWrite;
}
