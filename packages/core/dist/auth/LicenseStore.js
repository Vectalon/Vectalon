"use strict";
/**
 * LicenseStore — Read/write license and trial files
 * Business Source License 1.1 (BSL-1.1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseStore = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), '.config', 'vectalon');
const LICENSE_FILE = (0, path_1.join)(CONFIG_DIR, 'license.json');
const TRIAL_FILE = (0, path_1.join)(CONFIG_DIR, 'trial.json');
class LicenseStore {
    static read() {
        try {
            if ((0, fs_1.existsSync)(LICENSE_FILE)) {
                return JSON.parse((0, fs_1.readFileSync)(LICENSE_FILE, 'utf-8'));
            }
        }
        catch {
            // Corrupted or missing license
        }
        return null;
    }
    static write(license) {
        (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
        (0, fs_1.writeFileSync)(LICENSE_FILE, JSON.stringify(license, null, 2));
    }
    static clear() {
        if ((0, fs_1.existsSync)(LICENSE_FILE)) {
            (0, fs_1.writeFileSync)(LICENSE_FILE, JSON.stringify({}, null, 2));
        }
    }
    static readTrial() {
        try {
            if ((0, fs_1.existsSync)(TRIAL_FILE)) {
                return JSON.parse((0, fs_1.readFileSync)(TRIAL_FILE, 'utf-8'));
            }
        }
        catch {
            // Corrupted or missing trial
        }
        return null;
    }
    static writeTrial(trial) {
        (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
        (0, fs_1.writeFileSync)(TRIAL_FILE, JSON.stringify(trial, null, 2));
    }
    static clearTrial() {
        if ((0, fs_1.existsSync)(TRIAL_FILE)) {
            (0, fs_1.writeFileSync)(TRIAL_FILE, JSON.stringify({}, null, 2));
        }
    }
}
exports.LicenseStore = LicenseStore;
