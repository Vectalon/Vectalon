"use strict";
/**
 * Vectalon Core — Shared infrastructure for all Vectalon products
 * Business Source License 1.1 (BSL-1.1)
 * © 2026 Vectalon. Commercial use requires a paid license.
 * See LICENSE for details.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevMode = exports.VectalonConfig = exports.UsageReporter = exports.requireTier = exports.FeatureGates = exports.TierResolver = exports.TrialTracker = exports.LicenseValidator = exports.LicenseStore = void 0;
// Auth
var LicenseStore_1 = require("./auth/LicenseStore");
Object.defineProperty(exports, "LicenseStore", { enumerable: true, get: function () { return LicenseStore_1.LicenseStore; } });
var LicenseValidator_1 = require("./auth/LicenseValidator");
Object.defineProperty(exports, "LicenseValidator", { enumerable: true, get: function () { return LicenseValidator_1.LicenseValidator; } });
var TrialTracker_1 = require("./auth/TrialTracker");
Object.defineProperty(exports, "TrialTracker", { enumerable: true, get: function () { return TrialTracker_1.TrialTracker; } });
// Billing
var TierResolver_1 = require("./billing/TierResolver");
Object.defineProperty(exports, "TierResolver", { enumerable: true, get: function () { return TierResolver_1.TierResolver; } });
var FeatureGates_1 = require("./billing/FeatureGates");
Object.defineProperty(exports, "FeatureGates", { enumerable: true, get: function () { return FeatureGates_1.FeatureGates; } });
Object.defineProperty(exports, "requireTier", { enumerable: true, get: function () { return FeatureGates_1.requireTier; } });
// Telemetry
var UsageReporter_1 = require("./telemetry/UsageReporter");
Object.defineProperty(exports, "UsageReporter", { enumerable: true, get: function () { return UsageReporter_1.UsageReporter; } });
// Config
var VectalonConfig_1 = require("./config/VectalonConfig");
Object.defineProperty(exports, "VectalonConfig", { enumerable: true, get: function () { return VectalonConfig_1.VectalonConfig; } });
// Dev mode
var DevMode_1 = require("./dev/DevMode");
Object.defineProperty(exports, "DevMode", { enumerable: true, get: function () { return DevMode_1.DevMode; } });
