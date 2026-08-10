"use strict";
/**
 * UsageReporter — Anonymous, opt-in telemetry
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageReporter = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const crypto_1 = require("crypto");
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), '.config', 'vectalon');
const TELEMETRY_FILE = (0, path_1.join)(CONFIG_DIR, 'telemetry.json');
const BATCH_SIZE = 50;
const API_ENDPOINT = 'https://api.vectalon.in/v1/telemetry';
class UsageReporter {
    enabled;
    constructor() {
        this.enabled = this.readEnabled();
    }
    static isEnabled() {
        try {
            if ((0, fs_1.existsSync)(TELEMETRY_FILE)) {
                const config = JSON.parse((0, fs_1.readFileSync)(TELEMETRY_FILE, 'utf-8'));
                return config.enabled === true;
            }
        }
        catch {
            // Default to disabled
        }
        return false;
    }
    static enable() {
        (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
        (0, fs_1.writeFileSync)(TELEMETRY_FILE, JSON.stringify({ enabled: true, optedInAt: Date.now() }, null, 2));
    }
    static disable() {
        (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
        (0, fs_1.writeFileSync)(TELEMETRY_FILE, JSON.stringify({ enabled: false, optedOutAt: Date.now() }, null, 2));
    }
    track(event, product, feature, metadata) {
        if (!this.enabled)
            return;
        if (process.env.VECTALON_DEV_MODE === '1')
            return;
        const telemetryEvent = {
            event,
            product,
            feature,
            tier: 'unknown', // Will be enriched server-side
            timestamp: Date.now(),
            sessionId: this.getSessionId(),
            deviceId: this.getDeviceId(),
            metadata,
        };
        this.enqueue(telemetryEvent);
    }
    async flush() {
        if (!this.enabled)
            return;
        const batch = this.readQueue();
        if (batch.events.length === 0)
            return;
        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(batch),
            });
            if (response.ok) {
                this.clearQueue();
            }
        }
        catch {
            // Silently fail — telemetry should never break the tool
        }
    }
    readEnabled() {
        return UsageReporter.isEnabled();
    }
    enqueue(event) {
        const queue = this.readQueue();
        queue.events.push(event);
        if (queue.events.length >= BATCH_SIZE) {
            this.flush();
        }
        else {
            this.writeQueue(queue);
        }
    }
    readQueue() {
        try {
            const queueFile = (0, path_1.join)(CONFIG_DIR, 'telemetry-queue.json');
            if ((0, fs_1.existsSync)(queueFile)) {
                return JSON.parse((0, fs_1.readFileSync)(queueFile, 'utf-8'));
            }
        }
        catch {
            // Empty queue
        }
        return { events: [] };
    }
    writeQueue(batch) {
        const queueFile = (0, path_1.join)(CONFIG_DIR, 'telemetry-queue.json');
        (0, fs_1.writeFileSync)(queueFile, JSON.stringify(batch, null, 2));
    }
    clearQueue() {
        const queueFile = (0, path_1.join)(CONFIG_DIR, 'telemetry-queue.json');
        (0, fs_1.writeFileSync)(queueFile, JSON.stringify({ events: [] }, null, 2));
    }
    getSessionId() {
        // Simple session ID based on process start time
        return `${process.pid}-${Math.floor(Date.now() / 1000 / 60 / 60)}`;
    }
    getDeviceId() {
        const data = `${(0, os_1.hostname)()}-${(0, os_1.userInfo)().username}-${process.platform}`;
        return (0, crypto_1.createHash)('sha256').update(data).digest('hex').slice(0, 16);
    }
}
exports.UsageReporter = UsageReporter;
