const fs = require('fs');
const path = require('path');

const dirPath = process.argv[2] || 'C:\\Users\\kensw\\dev\\DelawareQsoParty\\2026\\test';

fs.readdirSync(dirPath).forEach(file => {
  const filePath = path.join(dirPath, file);
  const stat = fs.statSync(filePath);
  
  if (stat.isFile()) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^CALLSIGN:\s*(\S+)/);
        if (match) {
          const token = match[1];
          const newFileName = `${token}.cbr`;
          const newFilePath = path.join(dirPath, newFileName);
          
          fs.renameSync(filePath, newFilePath);
          console.log(`Renamed: ${file} -> ${newFileName}`);
          break;
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }
});
