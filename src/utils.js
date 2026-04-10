const csv = require('csv-parser');
const fs = require('fs');

function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv({
          mapHeaders: ({ header }) => header.trim().toLowerCase()
      }))
      .on('data', (data) => {
          // Trim all values in the row
          const cleanedRow = {};
          for (const key in data) {
              cleanedRow[key] = data[key] ? data[key].toString().trim() : '';
          }
          results.push(cleanedRow);
      })
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

module.exports = { parseCSV };
