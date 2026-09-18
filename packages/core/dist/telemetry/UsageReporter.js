"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageReporter = void 0;
/**
 * UsageReporter — Anonymous, opt-in telemetry
 * Business Source License 1.1 (BSL-1.1)
 */
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const crypto_1 = require("crypto");
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), '.config', 'vectalon');
const TELEMETRY_FILE = (0, path_1.join)(CONFIG_DIR, 'telemetry.json');
const QUEUE_FILE = (0, path_1.join)(CONFIG_DIR, 'telemetry-queue.json');
const BATCH_SIZE = 50;
const API_ENDPOINT = 'https://api.vectalon.in/v1/telemetry';
const COUNTS = ['filesScanned', 'eventsIngested', 'crashes', 'traces', 'analytics'];
class UsageReporter {
    static denied = false;
    sessionId = (0, crypto_1.randomUUID)();
    static isEnabled() {
        if (UsageReporter.denied)
            return false;
        try {
            return JSON.parse((0, fs_1.readFileSync)(TELEMETRY_FILE, 'utf-8'))?.enabled === true;
        }
        catch {
            return false;
        }
    }
    static enable() {
        try {
            (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
            (0, fs_1.writeFileSync)(TELEMETRY_FILE, JSON.stringify({ enabled: true, optedInAt: Date.now() }, null, 2));
            if (JSON.parse((0, fs_1.readFileSync)(TELEMETRY_FILE, 'utf-8'))?.enabled === true)
                UsageReporter.denied = false;
        }
        catch { /* Optional telemetry must never interrupt product execution. */ }
    }
    static disable() {
        // Deny this process immediately even if durable consent cannot be written.
        UsageReporter.denied = true;
        try {
            (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
            (0, fs_1.writeFileSync)(TELEMETRY_FILE, JSON.stringify({ enabled: false, optedOutAt: Date.now() }, null, 2));
        }
        catch { /* Leave the queue untouched when consent cannot be written. */ }
    }
    track(event, product, feature, metadata) {
        if (!UsageReporter.isEnabled())
            return;
        try {
            const projected = this.project({ event, product, feature, metadata, timestamp: Date.now() });
            if (!projected)
                return;
            const queue = this.readQueue();
            queue.events = [...queue.events, projected].slice(-BATCH_SIZE);
            // Persist the triggering event before starting any automatic upload.
            if (this.writeQueue(queue) && queue.events.length >= BATCH_SIZE)
                void this.flush();
        }
        catch { /* Exceptional caller values and filesystem failures are nonblocking. */ }
    }
    async flush() {
        if (!UsageReporter.isEnabled())
            return;
        try {
            const batch = this.readQueue();
            if (batch.events.length === 0 || !UsageReporter.isEnabled())
                return;
            const response = await fetch(API_ENDPOINT, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(batch),
            });
            // ponytail: sequential reporter only; shared-store locking needs a separate design.
            if (response.ok && UsageReporter.isEnabled())
                this.writeQueue({ events: [] });
        }
        catch { /* Silently fail — telemetry should never break the tool. */ }
    }
    project(value) {
        try {
            if (!value || typeof value !== 'object')
                return;
            const record = value;
            if (record.event !== 'telemetry_ingest' || record.product !== 'rn' ||
                (record.feature !== undefined && record.feature !== ''))
                return;
            const metadata = {};
            if (record.metadata !== undefined) {
                if (!record.metadata || typeof record.metadata !== 'object' || Array.isArray(record.metadata))
                    return;
                for (const key of COUNTS) {
                    const count = record.metadata[key];
                    if (typeof count === 'number' && Number.isInteger(count) && count >= 0 && count <= 1000000000)
                        metadata[key] = count;
                }
            }
            return {
                event: 'telemetry_ingest', product: 'rn', tier: 'unknown',
                timestamp: typeof record.timestamp === 'number' && Number.isSafeInteger(record.timestamp) && record.timestamp >= 0
                    ? record.timestamp : Date.now(),
                sessionId: this.sessionId, deviceId: 'redacted', metadata,
            };
        }
        catch {
            return;
        }
    }
    readQueue() {
        try {
            const stored = JSON.parse((0, fs_1.readFileSync)(QUEUE_FILE, 'utf-8'));
            if (!Array.isArray(stored?.events))
                return { events: [] };
            const events = [];
            for (const value of stored.events) {
                const event = this.project(value);
                if (event)
                    events.push(event);
                if (events.length > BATCH_SIZE)
                    events.shift();
            }
            return { events };
        }
        catch {
            return { events: [] };
        }
    }
    writeQueue(batch) {
        try {
            (0, fs_1.writeFileSync)(QUEUE_FILE, JSON.stringify(batch, null, 2));
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.UsageReporter = UsageReporter;
