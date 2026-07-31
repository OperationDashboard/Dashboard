const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scriptRegex = /<script.*?>([\s\S]*?)<\/script>/g;
let match;
let blockCount = 1;

while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1];
    if (code.trim().length === 0) continue; // Skip external scripts
    
    try {
        // We use new Function to parse the code. If there's a syntax error, it throws.
        new Function(code);
        console.log(`Script block ${blockCount} syntax is OK!`);
    } catch (e) {
        console.error(`Syntax Error in Script Block ${blockCount}:`);
        console.error(e.message);
        
        // Let's print exactly where it fails using node's vm module
        const vm = require('vm');
        try {
            new vm.Script(code);
        } catch (err) {
            console.error(err.stack);
        }
    }
    blockCount++;
}
