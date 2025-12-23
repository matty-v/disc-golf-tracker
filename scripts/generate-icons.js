#!/usr/bin/env node
/**
 * Generate simple PNG icons for the disc golf app
 * Creates solid-colored icons with the primary theme color
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Icon sizes to generate
const SIZES = [192, 512];

// Primary color (indigo from our dark theme)
const PRIMARY_COLOR = { r: 99, g: 102, b: 241 }; // #6366f1

/**
 * Calculate CRC32 for PNG chunks
 */
function crc32(data) {
    let crc = -1;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
}

// Pre-computed CRC32 table
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
}

/**
 * Create a PNG chunk
 */
function createChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const crcData = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);

    return Buffer.concat([length, typeBytes, data, crc]);
}

/**
 * Generate a PNG image with a disc golf basket icon
 */
function generatePNG(size) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk (image header)
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);  // width
    ihdr.writeUInt32BE(size, 4);  // height
    ihdr.writeUInt8(8, 8);        // bit depth
    ihdr.writeUInt8(2, 9);        // color type (RGB)
    ihdr.writeUInt8(0, 10);       // compression
    ihdr.writeUInt8(0, 11);       // filter
    ihdr.writeUInt8(0, 12);       // interlace

    // Generate image data with a simple disc golf basket design
    const rawData = [];
    const center = size / 2;
    const basketRadius = size * 0.35;
    const poleWidth = size * 0.05;
    const chainRadius = size * 0.3;

    for (let y = 0; y < size; y++) {
        rawData.push(0); // filter byte for each row
        for (let x = 0; x < size; x++) {
            const dx = x - center;
            const dy = y - center;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Background gradient (dark to darker)
            let r = 15, g = 15, b = 26; // --color-bg-primary

            // Draw circular background
            if (dist < size * 0.45) {
                r = 30; g = 30; b = 46; // --color-bg-secondary
            }

            // Draw basket (chains represented as ring)
            if (dist > chainRadius - size * 0.03 && dist < chainRadius + size * 0.03 && y < center + size * 0.1) {
                r = PRIMARY_COLOR.r;
                g = PRIMARY_COLOR.g;
                b = PRIMARY_COLOR.b;
            }

            // Draw pole
            if (Math.abs(dx) < poleWidth && y > center - size * 0.1) {
                r = PRIMARY_COLOR.r;
                g = PRIMARY_COLOR.g;
                b = PRIMARY_COLOR.b;
            }

            // Draw basket top rim
            if (dist > basketRadius - size * 0.04 && dist < basketRadius + size * 0.02 && y > center - size * 0.05 && y < center + size * 0.15) {
                r = PRIMARY_COLOR.r;
                g = PRIMARY_COLOR.g;
                b = PRIMARY_COLOR.b;
            }

            // Draw basket bottom
            if (y > center + size * 0.15 && y < center + size * 0.25 && Math.abs(dx) < basketRadius * 0.8) {
                const basketY = (y - (center + size * 0.15)) / (size * 0.1);
                const basketX = Math.abs(dx) / (basketRadius * 0.8);
                if (basketX < 1 - basketY * 0.3) {
                    r = PRIMARY_COLOR.r;
                    g = PRIMARY_COLOR.g;
                    b = PRIMARY_COLOR.b;
                }
            }

            rawData.push(r, g, b);
        }
    }

    // Compress image data
    const compressed = zlib.deflateSync(Buffer.from(rawData), { level: 9 });

    // IDAT chunk (image data)
    const idat = createChunk('IDAT', compressed);

    // IEND chunk (image end)
    const iend = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([
        signature,
        createChunk('IHDR', ihdr),
        idat,
        iend
    ]);
}

// Main execution
const iconsDir = path.join(__dirname, '..', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate icons
for (const size of SIZES) {
    const png = generatePNG(size);
    const filename = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(filename, png);
    console.log(`Generated: icon-${size}.png (${png.length} bytes)`);
}

console.log('\nIcon generation complete!');
