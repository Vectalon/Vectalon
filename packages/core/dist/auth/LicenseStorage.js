"use strict";
/**
 * Atomic license-token storage for Vectalon Core
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtomicLicenseStorage = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const nodeFileSystem = { existsSync: fs_1.existsSync, mkdirSync: fs_1.mkdirSync, readFileSync: fs_1.readFileSync, renameSync: fs_1.renameSync, writeFileSync: fs_1.writeFileSync };
/**
 * Durable file storage that writes a replacement atomically and retains the last
 * complete record as a recoverable previous version. It never accepts a lower
 * primary revision than the retained previous revision.
 */
class AtomicLicenseStorage {
    currentPath;
    previousPath;
    fileSystem;
    constructor(options) {
        const filename = options.filename ?? 'license.json';
        this.currentPath = (0, path_1.join)(options.directory, filename);
        this.previousPath = (0, path_1.join)(options.directory, `${filename}.previous`);
        this.fileSystem = options.fileSystem ?? nodeFileSystem;
    }
    read() {
        const current = this.readRecord(this.currentPath);
        const previous = this.readRecord(this.previousPath);
        if (current.state === 'unavailable' || previous.state === 'unavailable') {
            return { ok: false, code: 'corrupt_storage' };
        }
        if (current.state === 'valid' && previous.state === 'valid') {
            if (current.record.revision < previous.record.revision || (current.record.revision === previous.record.revision && !sameRecord(current.record, previous.record))) {
                return { ok: false, code: 'rollback_detected' };
            }
        }
        if (current.state === 'valid')
            return { ok: true, record: current.record, recovered: false };
        if (previous.state === 'valid')
            return { ok: true, record: previous.record, recovered: true };
        if (current.state === 'missing' && previous.state === 'missing')
            return { ok: false, code: 'not_found' };
        return { ok: false, code: 'corrupt_storage' };
    }
    write(record) {
        const input = snapshotWriteInput(record);
        if (!input)
            return { ok: false, code: 'invalid_record' };
        const existing = this.read();
        if (!existing.ok && existing.code !== 'not_found') {
            return { ok: false, code: existing.code === 'rollback_detected' ? 'rollback_detected' : 'corrupt_storage' };
        }
        const next = Object.freeze({
            version: 1,
            revision: existing.ok ? existing.record.revision + 1 : 1,
            token: input.token,
            lastTrustedTime: input.lastTrustedTime,
            lastOnlineAt: input.lastOnlineAt,
        });
        try {
            const directory = (0, path_1.join)(this.currentPath, '..');
            this.fileSystem.mkdirSync(directory, { recursive: true });
            // Publish the last validated record first. If the process stops before
            // current is published, equal records represent a recoverable transition.
            if (existing.ok)
                this.atomicWrite(this.previousPath, JSON.stringify(existing.record));
            this.atomicWrite(this.currentPath, JSON.stringify(next));
            return { ok: true, record: next };
        }
        catch {
            return { ok: false, code: 'corrupt_storage' };
        }
    }
    readRecord(path) {
        try {
            if (!this.fileSystem.existsSync(path))
                return { state: 'missing' };
        }
        catch {
            return { state: 'unavailable' };
        }
        let raw;
        try {
            raw = this.fileSystem.readFileSync(path, 'utf8');
        }
        catch {
            return { state: 'unavailable' };
        }
        try {
            const value = JSON.parse(raw);
            if (!isStoredLicenseRecord(value))
                return { state: 'invalid' };
            return { state: 'valid', record: Object.freeze({ ...value }) };
        }
        catch {
            return { state: 'invalid' };
        }
    }
    atomicWrite(path, content) {
        const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
        this.fileSystem.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
        this.fileSystem.renameSync(temporary, path);
    }
}
exports.AtomicLicenseStorage = AtomicLicenseStorage;
function snapshotWriteInput(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    try {
        const record = value;
        const token = record.token;
        const lastTrustedTime = record.lastTrustedTime;
        const lastOnlineAt = record.lastOnlineAt;
        if (typeof token !== 'string' || token.length === 0 || !validTimestamp(lastTrustedTime) || !validTimestamp(lastOnlineAt))
            return null;
        return Object.freeze({ token, lastTrustedTime, lastOnlineAt });
    }
    catch {
        return null;
    }
}
function isStoredLicenseRecord(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const record = value;
    return record.version === 1 && Number.isSafeInteger(record.revision) && record.revision > 0 &&
        typeof record.token === 'string' && record.token.length > 0 && validTimestamp(record.lastTrustedTime) && validTimestamp(record.lastOnlineAt);
}
function validTimestamp(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function sameRecord(left, right) {
    return left.version === right.version && left.revision === right.revision && left.token === right.token &&
        left.lastTrustedTime === right.lastTrustedTime && left.lastOnlineAt === right.lastOnlineAt;
}
