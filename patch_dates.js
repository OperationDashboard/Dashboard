const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace where("date", ">=", A).where("date", "<=", B)
html = html.replace(/\.where\("date", ">=", ([^)]+)\)\.where\("date", "<=", ([^)]+)\)/g, 
  '.where(firebase.firestore.FieldPath.documentId(), ">=", $1 + "_").where(firebase.firestore.FieldPath.documentId(), "<=", $2 + "_\\uf8ff")');

// Replace where("date", "==", A)
html = html.replace(/\.where\("date", "==", ([^)]+)\)/g, 
  '.where(firebase.firestore.FieldPath.documentId(), ">=", $1 + "_").where(firebase.firestore.FieldPath.documentId(), "<=", $1 + "_\\uf8ff")');

fs.writeFileSync('index.html', html);
console.log('Replaced date queries');
