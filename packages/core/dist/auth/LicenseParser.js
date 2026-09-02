"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseLicenseToken = parseLicenseToken;
const util_1 = require("util");
const MAX_TOKEN_SIZE = 16_384;
const MAX_HEADER_SIZE = 1_024;
const MAX_PAYLOAD_SIZE = 8_192;
const MAX_SIGNATURE_SIZE = 1_024;
const MAX_JSON_DEPTH = 32;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const utf8 = new util_1.TextDecoder('utf-8', { fatal: true });
function parseLicenseToken(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_TOKEN_SIZE) {
        return { ok: false, code: 'oversized' };
    }
    const segments = raw.split('.');
    if (segments.length !== 3 || segments.some(segment => segment.length === 0)) {
        return { ok: false, code: 'invalid_format' };
    }
    const [headerSegment, payloadSegment, signatureSegment] = segments;
    const headerBytes = decodeBase64url(headerSegment);
    const payloadBytes = decodeBase64url(payloadSegment);
    const signature = decodeBase64url(signatureSegment);
    if (!headerBytes || !payloadBytes || !signature) {
        return { ok: false, code: 'invalid_base64url' };
    }
    if (headerBytes.length > MAX_HEADER_SIZE ||
        payloadBytes.length > MAX_PAYLOAD_SIZE ||
        signature.length > MAX_SIGNATURE_SIZE) {
        return { ok: false, code: 'oversized' };
    }
    const header = parseObject(headerBytes, 'invalid_header');
    if (!header.ok)
        return header;
    const payload = parseObject(payloadBytes, 'invalid_payload');
    if (!payload.ok)
        return payload;
    return {
        ok: true,
        token: {
            header: header.value,
            payload: payload.value,
            signature,
            signingInput: `${headerSegment}.${payloadSegment}`,
        },
    };
}
function decodeBase64url(segment) {
    if (!BASE64URL.test(segment) || segment.length % 4 === 1)
        return null;
    const decoded = Buffer.from(segment, 'base64url');
    return decoded.toString('base64url') === segment ? decoded : null;
}
function parseObject(bytes, invalidShape) {
    let json;
    let value;
    try {
        json = utf8.decode(bytes);
        value = JSON.parse(json);
    }
    catch {
        return { ok: false, code: 'invalid_json' };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { ok: false, code: invalidShape };
    }
    try {
        assertNoDuplicateKeys(json);
    }
    catch (error) {
        return {
            ok: false,
            code: error instanceof DuplicateKeyError ? 'duplicate_key' : 'invalid_json',
        };
    }
    return { ok: true, value: value };
}
class DuplicateKeyError extends Error {
}
function assertNoDuplicateKeys(json) {
    let cursor = 0;
    const whitespace = () => {
        while (/\s/.test(json[cursor] ?? ''))
            cursor++;
    };
    const string = () => {
        const start = cursor;
        cursor++;
        let escaped = false;
        while (cursor < json.length) {
            const char = json[cursor++];
            if (!escaped && char === '"')
                return JSON.parse(json.slice(start, cursor));
            if (!escaped && char === '\\')
                escaped = true;
            else
                escaped = false;
        }
        throw new Error('unterminated string');
    };
    const value = (depth) => {
        if (depth > MAX_JSON_DEPTH)
            throw new Error('maximum JSON depth exceeded');
        whitespace();
        const char = json[cursor];
        if (char === '{')
            return object(depth + 1);
        if (char === '[')
            return array(depth + 1);
        if (char === '"') {
            string();
            return;
        }
        while (cursor < json.length && !/[\s,\]}]/.test(json[cursor]))
            cursor++;
    };
    const object = (depth) => {
        cursor++;
        whitespace();
        const keys = new Set();
        if (json[cursor] === '}') {
            cursor++;
            return;
        }
        while (cursor < json.length) {
            whitespace();
            const key = string();
            if (keys.has(key))
                throw new DuplicateKeyError();
            keys.add(key);
            whitespace();
            if (json[cursor++] !== ':')
                throw new Error('missing colon');
            value(depth);
            whitespace();
            const delimiter = json[cursor++];
            if (delimiter === '}')
                return;
            if (delimiter !== ',')
                throw new Error('missing comma');
        }
        throw new Error('unterminated object');
    };
    const array = (depth) => {
        cursor++;
        whitespace();
        if (json[cursor] === ']') {
            cursor++;
            return;
        }
        while (cursor < json.length) {
            value(depth);
            whitespace();
            const delimiter = json[cursor++];
            if (delimiter === ']')
                return;
            if (delimiter !== ',')
                throw new Error('missing comma');
        }
        throw new Error('unterminated array');
    };
    value(0);
    whitespace();
    if (cursor !== json.length)
        throw new Error('trailing content');
}
