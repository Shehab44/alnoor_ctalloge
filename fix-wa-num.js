const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');

c = c.replace(/const WHATSAPP_NUMBER = '0096181473454';/g, "const WHATSAPP_NUMBER = '96181473454';");

fs.writeFileSync('index.html', c);
console.log("Fixed WhatsApp number format");
