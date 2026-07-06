const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://iqsyncorg_db_user:X4mkKlrr14D1yBFZ@erpedu.ttrt2eu.mongodb.net/edu-crm?retryWrites=true&w=majority';

async function testConnection() {
  try {
    console.log('Connecting...');
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to Atlas successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }
}

testConnection();
