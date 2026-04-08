// src/utils.js
const fs = require('fs');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');

/**
 * Parse a CSV file into an array of objects.
 * Assumes header row with column names.
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        // Normalize keys to lowercase
        const normalizedRow = {};
        for (const key in row) {
          normalizedRow[key.trim().toLowerCase()] = row[key];
        }
        records.push(normalizedRow);
      })
      .on('end', () => resolve(records))
      .on('error', (err) => reject(err));
  });
}

/**
 * Write an array of objects to a CSV file.
 */
function writeCSV(filePath, data) {
  return new Promise((resolve, reject) => {
    const columns = Object.keys(data[0] || {});
    const stringifier = stringify({ header: true, columns });
    const writable = fs.createWriteStream(filePath);
    stringifier.pipe(writable);
    data.forEach((row) => stringifier.write(row));
    stringifier.end();
    writable.on('finish', resolve);
    writable.on('error', reject);
  });
}

module.exports = { parseCSV, writeCSV };
