"use strict";
/**
 * VectalonConfig — Shared configuration store
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectalonConfig = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const types_1 = require("./types");
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), '.config', 'vectalon');
const CONFIG_FILE = (0, path_1.join)(CONFIG_DIR, 'config.json');
let cache = null;
class VectalonConfig {
    static load() {
        if (cache)
            return cache;
        try {
            if ((0, fs_1.existsSync)(CONFIG_FILE)) {
                cache = JSON.parse((0, fs_1.readFileSync)(CONFIG_FILE, 'utf-8'));
            }
        }
        catch {
            // Corrupted or missing config
        }
        cache = cache || {};
        return cache;
    }
    static save() {
        if (cache) {
            (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
            (0, fs_1.writeFileSync)(CONFIG_FILE, JSON.stringify(cache, null, 2));
        }
    }
    static get(key) {
        const data = this.load();
        return key in data ? data[key] : types_1.DEFAULTS[key];
    }
    static set(key, value) {
        const data = this.load();
        data[key] = value;
        cache = data;
        this.save();
    }
    static reset() {
        cache = {};
        this.save();
    }
    static all() {
        return { ...types_1.DEFAULTS, ...this.load() };
    }
}
exports.VectalonConfig = VectalonConfig;
