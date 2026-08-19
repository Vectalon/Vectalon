"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONTRACT_REVISION = exports.CONTRACT_SCHEMAS = exports.CONTRACT_NAMES = void 0;
exports.generateRegistryManifest = generateRegistryManifest;
exports.findBreakingSchemaChanges = findBreakingSchemaChanges;
exports.validateContract = validateContract;
exports.generateContractTypes = generateContractTypes;
const node_crypto_1 = require("node:crypto");
const _2020_1 = __importDefault(require("ajv/dist/2020"));
const Capability_schema_json_1 = __importDefault(require("./schemas/Capability.schema.json"));
const DiagnosticResult_schema_json_1 = __importDefault(require("./schemas/DiagnosticResult.schema.json"));
const EntitlementDecision_schema_json_1 = __importDefault(require("./schemas/EntitlementDecision.schema.json"));
const ErrorEnvelope_schema_json_1 = __importDefault(require("./schemas/ErrorEnvelope.schema.json"));
const IdentityReference_schema_json_1 = __importDefault(require("./schemas/IdentityReference.schema.json"));
const LicenseClaims_schema_json_1 = __importDefault(require("./schemas/LicenseClaims.schema.json"));
const ProductDefinition_schema_json_1 = __importDefault(require("./schemas/ProductDefinition.schema.json"));
const TelemetryEvent_schema_json_1 = __importDefault(require("./schemas/TelemetryEvent.schema.json"));
const TrialCredential_schema_json_1 = __importDefault(require("./schemas/TrialCredential.schema.json"));
exports.CONTRACT_NAMES = [
    'Capability',
    'DiagnosticResult',
    'EntitlementDecision',
    'ErrorEnvelope',
    'IdentityReference',
    'LicenseClaims',
    'ProductDefinition',
    'TelemetryEvent',
    'TrialCredential',
];
exports.CONTRACT_SCHEMAS = {
    Capability: Capability_schema_json_1.default,
    DiagnosticResult: DiagnosticResult_schema_json_1.default,
    EntitlementDecision: EntitlementDecision_schema_json_1.default,
    ErrorEnvelope: ErrorEnvelope_schema_json_1.default,
    IdentityReference: IdentityReference_schema_json_1.default,
    LicenseClaims: LicenseClaims_schema_json_1.default,
    ProductDefinition: ProductDefinition_schema_json_1.default,
    TelemetryEvent: TelemetryEvent_schema_json_1.default,
    TrialCredential: TrialCredential_schema_json_1.default,
};
const canonicalRegistry = exports.CONTRACT_NAMES.map(name => JSON.stringify(exports.CONTRACT_SCHEMAS[name])).join('\n');
exports.CONTRACT_REVISION = `1.0.0+${(0, node_crypto_1.createHash)('sha256').update(canonicalRegistry).digest('hex')}`;
function generateRegistryManifest() {
    return {
        contractVersion: '1.0.0',
        revision: exports.CONTRACT_REVISION,
        generator: { name: 'vectalon-core', version: '1.0.0' },
        typeProjectionDigest: (0, node_crypto_1.createHash)('sha256').update(generateContractTypes()).digest('hex'),
        compatibility: {
            unknownFields: 'accept',
            unknownMajorVersions: 'reject',
            previousMajorVersions: 'reject',
        },
        schemas: exports.CONTRACT_NAMES.map(name => ({
            name,
            owner: 'core',
            id: exports.CONTRACT_SCHEMAS[name].$id,
            version: '1.0.0',
            digest: (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(exports.CONTRACT_SCHEMAS[name])).digest('hex'),
            status: 'current',
        })),
    };
}
function findBreakingSchemaChanges(previous, candidate, path = '') {
    const changes = [];
    const location = path || '/';
    const tightenedMinimums = ['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties'];
    const tightenedMaximums = ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties'];
    if (JSON.stringify(previous.type) !== JSON.stringify(candidate.type))
        changes.push(`${location} changed type`);
    if (candidate.const !== undefined && previous.const !== candidate.const)
        changes.push(`${location} changed its constant value`);
    if (candidate.enum) {
        const candidateValues = new Set(candidate.enum);
        if (!previous.enum)
            changes.push(`${location} introduced an enum restriction`);
        else
            for (const value of previous.enum) {
                if (!candidateValues.has(value))
                    changes.push(`${location} removed enum value ${JSON.stringify(value)}`);
            }
    }
    for (const keyword of tightenedMinimums) {
        if (candidate[keyword] !== undefined && (previous[keyword] === undefined || candidate[keyword] > previous[keyword])) {
            changes.push(`${location} tightened ${keyword}`);
        }
    }
    for (const keyword of tightenedMaximums) {
        if (candidate[keyword] !== undefined && (previous[keyword] === undefined || candidate[keyword] < previous[keyword])) {
            changes.push(`${location} tightened ${keyword}`);
        }
    }
    for (const keyword of ['pattern', 'format', 'multipleOf']) {
        if (candidate[keyword] !== undefined && candidate[keyword] !== previous[keyword]) {
            changes.push(`${location} changed ${keyword}`);
        }
    }
    if (previous.additionalProperties !== false && candidate.additionalProperties === false) {
        changes.push(`${location} stopped accepting additional properties`);
    }
    if (previous.uniqueItems !== true && candidate.uniqueItems === true) {
        changes.push(`${location} now requires unique items`);
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf', 'not', 'contains', 'if', 'then', 'else']) {
        if (JSON.stringify(previous[keyword]) !== JSON.stringify(candidate[keyword]) && candidate[keyword] !== undefined) {
            changes.push(`${location} changed ${keyword}`);
        }
    }
    const previousRequired = new Set(previous.required ?? []);
    const candidateRequired = new Set(candidate.required ?? []);
    for (const field of candidateRequired) {
        if (!previousRequired.has(field))
            changes.push(`${path}/${field} became required`);
    }
    const previousProperties = previous.properties ?? {};
    const candidateProperties = candidate.properties ?? {};
    for (const [field, oldProperty] of Object.entries(previousProperties)) {
        const fieldPath = `${path}/${field}`;
        const newProperty = candidateProperties[field];
        if (!newProperty) {
            changes.push(`${fieldPath} was removed`);
            continue;
        }
        changes.push(...findBreakingSchemaChanges(oldProperty, newProperty, fieldPath));
    }
    if (candidate.items && !previous.items)
        changes.push(`${location} added item constraints`);
    if (previous.items && candidate.items)
        changes.push(...findBreakingSchemaChanges(previous.items, candidate.items, `${path}/*`));
    return changes;
}
const ajv = new _2020_1.default({ allErrors: true, strict: true });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
const validators = Object.fromEntries(exports.CONTRACT_NAMES.map(name => [name, ajv.compile(exports.CONTRACT_SCHEMAS[name])]));
const sensitiveFields = new Set([
    'email',
    'licensekey',
    'accesstoken',
    'refreshtoken',
    'password',
    'authorization',
    'token',
    'apikey',
    'secret',
    'cookie',
]);
function sensitiveMetadataErrors(value, path = '/metadata') {
    if (!value || typeof value !== 'object')
        return [];
    if (Array.isArray(value))
        return value.flatMap((entry, index) => sensitiveMetadataErrors(entry, `${path}/${index}`));
    return Object.entries(value).flatMap(([key, entry]) => {
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const keyPath = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        const ownError = sensitiveFields.has(normalized) ? [{ path: keyPath, code: 'sensitive-field' }] : [];
        return [...ownError, ...sensitiveMetadataErrors(entry, keyPath)];
    });
}
function schemaError(error) {
    const missing = error.keyword === 'required' ? `/${String(error.params.missingProperty)}` : '';
    const path = `${error.instancePath}${missing}` || '/';
    if (path === '/contractVersion' && error.keyword === 'const')
        return { path, code: 'unsupported-version' };
    if (path.endsWith('/price/minorUnits') && error.keyword === 'type')
        return { path, code: 'integer-minor-units' };
    return { path, code: `schema-${error.keyword}` };
}
function semanticErrors(name, value) {
    if (!value || typeof value !== 'object')
        return [];
    // Values are inspected only after the object guard above; schema validation remains authoritative.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = value;
    const errors = [];
    if (name === 'LicenseClaims' || name === 'TrialCredential') {
        const issued = Date.parse(payload.issuedAt);
        const expires = Date.parse(payload.expiresAt);
        if (Number.isFinite(issued) && Number.isFinite(expires) && expires <= issued) {
            errors.push({ path: '/expiresAt', code: 'time-order' });
        }
    }
    if (name === 'TelemetryEvent' && payload.metadata && typeof payload.metadata === 'object') {
        errors.push(...sensitiveMetadataErrors(payload.metadata));
    }
    return errors;
}
function validateContract(name, value) {
    const validator = validators[name];
    const schemaErrors = validator(value) ? [] : (validator.errors ?? []).map(schemaError);
    const errors = [...schemaErrors, ...semanticErrors(name, value)];
    return { valid: errors.length === 0, errors };
}
function propertyType(schema) {
    const literal = (value) => typeof value === 'string'
        ? `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
        : JSON.stringify(value);
    if (schema.const !== undefined)
        return literal(schema.const);
    if (schema.enum)
        return schema.enum.map((value) => literal(value)).join(' | ');
    if (Array.isArray(schema.type))
        return schema.type.map((type) => propertyType({ ...schema, type })).join(' | ');
    if (schema.type === 'string')
        return 'string';
    if (schema.type === 'integer' || schema.type === 'number')
        return 'number';
    if (schema.type === 'boolean')
        return 'boolean';
    if (schema.type === 'null')
        return 'null';
    if (schema.type === 'array')
        return `${propertyType(schema.items ?? {})}[]`;
    if (schema.type === 'object' || schema.properties) {
        const required = new Set(schema.required ?? []);
        const fields = Object.entries(schema.properties ?? {}).map(([key, value]) => `${key}${required.has(key) ? '' : '?'}: ${propertyType(value)}`);
        return fields.length ? `{ ${fields.join('; ')} }` : 'Record<string, unknown>';
    }
    return 'unknown';
}
function generateContractTypes() {
    const body = exports.CONTRACT_NAMES.map(name => {
        const schema = exports.CONTRACT_SCHEMAS[name];
        const required = new Set(schema.required ?? []);
        const fields = Object.entries(schema.properties ?? {}).map(([key, value]) => `  ${key}${required.has(key) ? '' : '?'}: ${propertyType(value)}`);
        return `export interface ${name} {\n${fields.join('\n')}\n}`;
    });
    return `// Generated from Vectalon Core contracts. Do not edit.\n\n${body.join('\n\n')}\n`;
}
